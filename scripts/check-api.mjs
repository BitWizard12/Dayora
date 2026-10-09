import { pathToFileURL } from 'node:url'
import { apiOrigin } from './deployment-config.mjs'
import { OperationalError, runOperation } from '../server/operations.js'

export function apiCheckConfig(env = process.env) {
  let api, frontend
  try { api = apiOrigin(env.DAYORA_API_URL); frontend = apiOrigin(env.APP_ORIGIN || 'https://dayora-five.vercel.app') }
  catch { throw new OperationalError('API check requires exact public HTTPS DAYORA_API_URL and APP_ORIGIN; values were not logged.') }
  if (!api) throw new OperationalError('Set DAYORA_API_URL to the real Render HTTPS origin after deployment.')
  return { api, frontend }
}

export async function checkApi(config, { fetcher = fetch, report = console.info } = {}) {
  const check = (ok, message) => { if (!ok) throw new OperationalError(message) }
  const get = async (path, origin = config.frontend, options = {}) => {
    let response
    try { response = await fetcher(config.api + path, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(60000), ...options, headers: { Origin: origin, ...options.headers } }) }
    catch { throw new OperationalError('API request failed. Check HTTPS, Render startup logs and service availability.') }
    return response
  }
  const json = async (response) => {
    check(/application\/json/i.test(response.headers.get('content-type') || ''), 'API returned a non-JSON response; check the target service and startup logs.')
    const text = await response.text()
    check(text.length < 32768 && !/\b(?:stack|private_key|BEGIN PRIVATE KEY)\b|\bat \S+ \([^)]*:\d+:\d+\)/i.test(text), 'API response exposed unexpected diagnostic fields.')
    try { return JSON.parse(text) } catch { throw new OperationalError('API returned invalid JSON.') }
  }
  for (const [path, status] of [['live', 'ok'], ['ready', 'ready']]) {
    const response = await get('/api/health/' + path), body = await json(response)
    check(response.status === 200 && body.status === status && (path !== 'live' || body.service === 'Dayora'), 'API health check failed. Inspect Render startup and Firebase permissions.')
    check(response.headers.get('access-control-allow-origin') === config.frontend && response.headers.get('access-control-allow-credentials') === 'true', 'Exact-origin credentialed CORS check failed.')
    report('PASS /api/health/' + path)
  }
  const options = await get('/api/workspace', config.frontend, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type,x-csrf-token,x-workspace-id' } })
  const headers = (options.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map((value) => value.trim())
  check(options.status === 204 && options.headers.get('access-control-allow-origin') === config.frontend && options.headers.get('access-control-allow-credentials') === 'true' && ['content-type', 'x-csrf-token', 'x-workspace-id'].every((key) => headers.includes(key)), 'Workspace CORS preflight failed.')
  const foreign = await get('/api/health/live', 'https://untrusted.invalid')
  check(foreign.headers.get('access-control-allow-origin') !== 'https://untrusted.invalid' && foreign.headers.get('access-control-allow-origin') !== '*', 'CORS unexpectedly reflects untrusted origins.')
  report('PASS credentialed CORS, workspace headers and untrusted-origin denial')
  const denied = await get('/api/workspace'), body = await json(denied)
  check(denied.status === 401 && body.error?.code === 'UNAUTHENTICATED' && typeof body.error.message === 'string' && Object.keys(body).every((key) => key === 'error') && Object.keys(body.error).every((key) => ['code', 'message', 'requestId'].includes(key)), 'Unauthenticated API rejection or safe JSON error check failed.')
  report('PASS unauthenticated workspace denial and safe JSON errors')
  report('INFO No credentials sent, user records changed or emails sent. These HTTP checks cannot certify browser third-party-cookie behavior.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runOperation('deployed_api_check', () => checkApi(apiCheckConfig()))
