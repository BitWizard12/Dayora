import { pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
import { readConfig } from '../server/config.js'
import { initializeFirebase, closeFirebase, verifyFirebase } from '../server/firebaseAdmin.js'
import { verifyFirebaseWebConfig } from '../server/firebaseAuthApi.js'
import { createApp } from '../server/app.js'
import { OperationalError, runOperation } from '../server/operations.js'
import { validatePublicEnvironment } from '../src/services/publicEnvironment.js'
import { apiOrigin } from './deployment-config.mjs'

export function deploymentEnvironment(env) {
  if (env.NODE_ENV !== 'production') throw new OperationalError('Preflight requires NODE_ENV=production. Inject production settings; do not change or upload local environment files.')
  const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_WEB_API_KEY', 'APP_ORIGIN', 'TRUST_PROXY', 'COOKIE_SAME_SITE', 'RATE_LIMIT_STORE', 'MAIL_MODE', 'MAIL_FROM', 'SMTP_URL']
  const missing = required.filter((key) => env[key] === undefined || !String(env[key]).trim())
  if (missing.length) throw new OperationalError(`Missing deployment keys: ${missing.join(', ')}. Verify the Render environment group is attached and service overrides are not empty.`)
  const config = readConfig(env)
  try { validatePublicEnvironment(env, { mode: 'production', command: 'build' }) }
  catch { throw new OperationalError('Public environment rejected. Only documented Dayora VITE_* keys and VITE_VERCEL_* metadata are allowed; production emulator variables are forbidden.') }
  const frontendKeys = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_AUTH_DOMAIN']
  if (frontendKeys.some((key) => env[key] !== undefined)) {
    if (frontendKeys.some((key) => !env[key]) || env.VITE_FIREBASE_PROJECT_ID !== config.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_API_KEY !== config.FIREBASE_WEB_API_KEY) throw new OperationalError('Frontend Firebase public configuration is incomplete or does not match the backend project/key.')
  }
  let origin
  try { origin = apiOrigin(env.VITE_API_URL || env.DAYORA_API_URL || '') }
  catch { throw new OperationalError('Production API configuration requires an exact public HTTPS origin. Localhost, credentials, paths and query strings are refused.') }
  if (new URL(config.APP_ORIGIN).hostname.endsWith('.vercel.app') && config.COOKIE_SAME_SITE !== 'none') throw new OperationalError('Direct Vercel-to-Render deployment requires COOKIE_SAME_SITE=none with production Secure cookies. Use same-site custom domains for lax cookies.')
  return { config, origin }
}

export async function verifyHealthWiring(config, fetcher = fetch) {
  // Health routes bypass request counters; this makes no Firestore writes.
  const app = createApp({ config, readiness: async () => true })
  const server = app.listen(0, '127.0.0.1')
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
    for (const [path, status] of [['live', 'ok'], ['ready', 'ready']]) {
      const response = await fetcher(`http://127.0.0.1:${server.address().port}/api/health/${path}`, { signal: AbortSignal.timeout(5000) })
      const body = await response.json()
      if (!response.ok || body.status !== status) throw new OperationalError('Health route wiring failed.')
    }
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) }
}

export async function runPreflight(env, { web = verifyFirebaseWebConfig, initialize = initializeFirebase, admin = verifyFirebase, close = closeFirebase, health = verifyHealthWiring, read = readFile, report = console.info } = {}) {
  const { config, origin } = deploymentEnvironment(env)
  report('PASS production environment, SMTP syntax, origin, cookies, limiter and public-variable validation')
  if (origin) {
    const deployment = JSON.parse(await read(new URL('../vercel.json', import.meta.url), 'utf8'))
    const policy = deployment.headers.flatMap((entry) => entry.headers).find((header) => header.key === 'Content-Security-Policy')?.value || ''
    for (const directive of ['connect-src', 'img-src']) {
      const allowed = policy.split(';').find((entry) => entry.trim().startsWith(directive + ' '))?.trim().split(/\s+/) || []
      if (!allowed.includes(origin)) throw new OperationalError('API origin is missing from Vercel CSP. Set VITE_API_URL and run npm run deployment:configure.')
    }
    report('PASS exact API origin and CSP')
  } else report('PENDING frontend API wiring: supply the real Render URL after it deploys; no URL was invented')
  try { await web(config) }
  catch { throw new OperationalError('Firebase public Web API key verification failed. Check FIREBASE_WEB_API_KEY, Identity Toolkit enablement, restrictions and connectivity.') }
  report('PASS Firebase public Web API key acceptance')
  try {
    initialize(config)
    await admin()
    report('PASS Firebase Admin Authentication and read-only Firestore connectivity')
    await health(config)
    report('PASS liveness/readiness route wiring')
  } catch (error) {
    if (error instanceof OperationalError) throw error
    throw new OperationalError('Firebase Admin/read-only Firestore verification failed. Check service-account project, permissions and connectivity.')
  } finally { await close() }
  report(config.FIREBASE_STORAGE_BUCKET ? 'INFO Storage configured; bucket upload permissions are not tested by this read-only preflight' : 'INFO Storage disabled; core app remains available and photo uploads are disabled')
  report('PASS backend preflight; no user data changed and no email sent')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runOperation('deployment_preflight', () => runPreflight(process.argv.includes('--backend-only') ? { ...process.env, VITE_API_URL: '', DAYORA_API_URL: '' } : process.env))
