import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { readConfig } from '../server/config.js'
import { createApp } from '../server/app.js'
import { createAuth } from '../server/auth.js'
import { createRecordRoutes } from '../server/records.js'
import { backend } from './helpers/backend.js'
import { deploymentEnvironment, runPreflight, verifyHealthWiring } from '../scripts/deployment-preflight.mjs'
import { apiCheckConfig, checkApi } from '../scripts/check-api.mjs'
import { loadPrivatePhoto } from '../src/services/media.js'
import { randomUUID } from 'node:crypto'

const production = { NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'dayora-production', FIREBASE_WEB_API_KEY: 'public-key', FIREBASE_SERVICE_ACCOUNT_JSON: '{}', APP_ORIGIN: 'https://dayora-five.vercel.app', TRUST_PROXY: '1', COOKIE_SAME_SITE: 'none', RATE_LIMIT_STORE: 'firestore', MAIL_MODE: 'smtp', MAIL_FROM: 'Dayora <hello@dayora.example>', SMTP_URL: 'smtps://user:private-password@smtp.dayora.example' }

test('production can start without Storage while rejecting missing keys, localhost and secret public variables', async () => {
  assert.equal(readConfig(production).FIREBASE_STORAGE_BUCKET, undefined)
  assert.equal(deploymentEnvironment(production).origin, '')
  for (const patch of [{ COOKIE_SAME_SITE: 'lax' }, { NODE_ENV: 'development' }, { FIREBASE_PROJECT_ID: '' }, { FIREBASE_WEB_API_KEY: '  ' }, { APP_ORIGIN: 'https://localhost' }, { VITE_API_URL: 'http://api.example' }, { VITE_API_URL: 'https://127.0.0.1' }, { VITE_SECRET: 'hidden' }, { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }, { VITE_FIREBASE_API_KEY: 'wrong' }]) assert.throws(() => deploymentEnvironment({ ...production, ...patch }))
  assert.doesNotThrow(() => deploymentEnvironment({ ...production, VITE_VERCEL_URL: 'system metadata' }))
  assert.throws(() => readConfig({ ...production, FIREBASE_PROJECT_ID: '' }), /environment group/)
  await verifyHealthWiring(readConfig(production))
})

test('preflight performs only injected read checks, reports pending API wiring and redacts failures', async () => {
  const operations = [], logs = []
  const hooks = { web: async () => operations.push('web'), initialize: () => operations.push('initialize'), admin: async () => operations.push('admin-read'), health: async () => operations.push('health'), close: async () => operations.push('close'), report: (line) => logs.push(line) }
  await runPreflight(production, hooks)
  assert.deepEqual(operations, ['web', 'initialize', 'admin-read', 'health', 'close'])
  assert.ok(logs.some((line) => line.startsWith('PENDING frontend')))
  assert.ok(!logs.join('').includes('private-password'))
  await assert.rejects(runPreflight(production, { ...hooks, web: async () => { throw new Error('private-password') } }), (error) => !error.message.includes('private-password'))
  await assert.rejects(runPreflight({ ...production, VITE_API_URL: 'https://api.dayora.example' }, { ...hooks, read: async () => JSON.stringify({ headers: [{ headers: [{ key: 'Content-Security-Policy', value: "connect-src 'self'; img-src 'self'" }] }] }) }), /CSP/)
})

test('deployed API checker enforces HTTPS, safe health/error JSON and exact credentialed CORS', async () => {
  assert.throws(() => apiCheckConfig({}), /DAYORA_API_URL/)
  assert.throws(() => apiCheckConfig({ DAYORA_API_URL: 'http://localhost:3001' }), /HTTPS/)
  const config = apiCheckConfig({ DAYORA_API_URL: 'https://api.dayora.example' })
  const fetcher = async (url, options) => {
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': config.frontend, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'Content-Type,X-CSRF-Token,X-Workspace-Id' }
    if (options.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    return url.endsWith('/workspace') ? new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Sign in.', requestId: 'id' } }), { status: 401, headers }) : new Response(JSON.stringify({ status: url.endsWith('/ready') ? 'ready' : 'ok', service: 'Dayora' }), { headers })
  }
  const logs = []
  await checkApi(config, { fetcher, report: (line) => logs.push(line) })
  assert.ok(logs.some((line) => line.includes('safe JSON errors')))
  await assert.rejects(checkApi(config, { fetcher: async () => new Response('<pre>stack trace</pre>', { headers: { 'content-type': 'text/html' } }), report: () => {} }), /non-JSON/)
  await assert.rejects(checkApi(config, { fetcher: async () => new Response('{"stack":"private"}', { headers: { 'content-type': 'application/json' } }), report: () => {} }), /diagnostic/)
})

test('Storage-disabled API keeps sessions, profile details and records usable and rejects new photos clearly', async (t) => {
  const { account, config, firebase } = await backend(t), alice = await account('Alice')
  const originalBucket = firebase.bucket
  firebase.bucket = null; t.after(() => { firebase.bucket = originalBucket })
  const auth = createAuth({ config: { ...config, FIREBASE_STORAGE_BUCKET: undefined }, mailer: async () => {} })
  const app = createApp({ config, routes: [auth.router, createRecordRoutes(auth)] })
  // Use a new fixture login instead of relying on supertest's request host.
  const agent = request.agent(app)
  const login = await agent.post('/api/auth/login').set('Origin', config.APP_ORIGIN).send({ email: alice.user.email, password: 'a strong testing password 123' })
  assert.equal(login.status, 200); assert.equal(login.body.user.photoUploadsEnabled, false)
  const send = (path, data, method = 'patch') => agent[method]('/api' + path).set('Origin', config.APP_ORIGIN).set('X-CSRF-Token', login.body.csrf).send(data)
  assert.equal((await send('/auth/profile', { name: 'Updated', about: 'Still works', jobTitle: '', photo: '' })).status, 200)
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOZkAAAAASUVORK5CYII='
  const denied = await send('/auth/profile', { name: 'Updated', about: '', jobTitle: '', photo })
  assert.equal(denied.status, 503); assert.equal(denied.body.error.code, 'STORAGE_UNAVAILABLE'); assert.match(denied.body.error.message, /Photo uploads are unavailable/)
  assert.equal((await send('/workspace/projects', { revision: 0, data: [{ id: randomUUID(), name: 'Core app works', status: 'Pending', deadline: '' }] }, 'put')).status, 200)
  assert.equal((await agent.get('/api/health/ready')).status, 200)
})

test('private photos use credentialed CORS and reject failed or non-raster responses', async () => {
  const blob = await loadPrivatePhoto('https://api.dayora.example/api/media/id', { fetcher: async (_url, options) => {
    assert.equal(options.credentials, 'include'); assert.equal(options.mode, 'cors')
    return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })
  } })
  assert.equal(blob.size, 4)
  await assert.rejects(loadPrivatePhoto('/api/media/id', { fetcher: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }) }), /Photo unavailable/)
  await assert.rejects(loadPrivatePhoto('/api/media/id', { fetcher: async () => new Response('', { status: 401 }) }), /Photo unavailable/)
})
