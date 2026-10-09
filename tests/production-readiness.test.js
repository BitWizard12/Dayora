import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../server/config.js'
import { verifyFirebase, createReadinessProbe, withDeadline } from '../server/firebaseAdmin.js'
import { createMailer } from '../server/mail.js'
import { accountEmail } from '../server/mailTemplates.js'
import { FirestoreRateLimitStore } from '../server/rateLimitStore.js'
import { recordsRef } from '../server/firebaseRepositories.js'
import { createApp } from '../server/app.js'
import { createAuth } from '../server/auth.js'
import { createAdminRoutes } from '../server/admin.js'
import { backend } from './helpers/backend.js'
import { smokeConfig, runSmoke } from '../scripts/smoke.mjs'
import { apiOrigin, configureHeaders } from '../scripts/deployment-config.mjs'
import { checkRestoredData } from '../server/restore-check.js'
import { readFile } from 'node:fs/promises'

const production = { NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'dayora-staging', FIREBASE_WEB_API_KEY: 'public-web-key', FIREBASE_SERVICE_ACCOUNT_JSON: '{}', FIREBASE_STORAGE_BUCKET: 'dayora-staging.firebasestorage.app', APP_ORIGIN: 'https://app.dayora.example', TRUST_PROXY: '1', MAIL_MODE: 'smtp', SMTP_URL: 'smtps://user:secret@smtp.example.com', MAIL_FROM: 'Dayora <hello@dayora.example>' }

test('Spark index configuration retains the session query index without billing-dependent TTL policies', async () => {
  const config = JSON.parse(await readFile(new URL('../firestore.indexes.json', import.meta.url), 'utf8'))
  assert.equal(config.fieldOverrides.some((field) => Object.hasOwn(field, 'ttl')), false)
  assert.deepEqual(config.fieldOverrides.find((field) => field.collectionGroup === 'sessions').indexes, [{ order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' }])
  assert.deepEqual(config.fieldOverrides.find((field) => field.collectionGroup === 'rateLimits').indexes, [])
})

test('shared limiter quota failures deny API access instead of falling back to memory or bypassing limits', async (t) => {
  const { config } = await backend(t), original = FirestoreRateLimitStore.prototype.increment
  FirestoreRateLimitStore.prototype.increment = async () => { throw new Error('private quota provider detail') }
  try {
    const app = createApp({ config: readConfig({ ...config, RATE_LIMIT_STORE: 'firestore' }), readiness: async () => true })
    const denied = await request(app).get('/api/auth/session')
    assert.equal(denied.status, 500); assert.ok(!JSON.stringify(denied.body).includes('private quota provider detail'))
    assert.equal((await request(app).get('/api/health/live')).status, 200)
  } finally { FirestoreRateLimitStore.prototype.increment = original }
})

test('production Firebase configuration rejects insecure deployment settings and emulator bypasses', () => {
  assert.equal(readConfig(production).RATE_LIMIT_STORE, 'firestore')
  for (const patch of [{ TRUST_PROXY: undefined }, { MAIL_FROM: undefined }, { MAIL_MODE: 'preview' }, { APP_ORIGIN: 'https://app.dayora.example/path' }, { APP_ORIGIN: 'https://secret:password@app.dayora.example' }, { FIREBASE_PROJECT_ID: undefined }, { FIREBASE_WEB_API_KEY: undefined }, { FIREBASE_SERVICE_ACCOUNT_JSON: undefined }, { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }, { RATE_LIMIT_STORE: 'memory' }, { TRUST_PROXY: 'true' }, { SMTP_URL: 'https://secret:password@cluster' }, { MAIL_FROM: 'Dayora <hello@example.com>' }]) assert.throws(() => readConfig({ ...production, ...patch }), (error) => !error.message.includes('password') && !error.message.includes('secret@'))
  assert.throws(() => readConfig({ ...production, NODE_ENV: 'prod' }), /NODE_ENV/)
  assert.throws(() => readConfig({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'live-project', FIREBASE_WEB_API_KEY: 'public', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }), /emulator/i)
  assert.throws(() => readConfig({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'demo-dayora', FIREBASE_WEB_API_KEY: 'public', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_STORAGE_BUCKET: 'demo-dayora.appspot.com' }), /Storage emulator/)
})

test('Firebase connectivity and transactional readiness checks are bounded and single-flight', async (t) => {
  await backend(t); await verifyFirebase()
  assert.deepEqual(await Promise.all([createReadinessProbe()(), createReadinessProbe()()]), [true, true])
  await assert.rejects(withDeadline(new Promise(() => {}), 10), /timed out/)
})

test('branded SMTP templates and safe delivery failures expose no email credentials or action codes', async () => {
  for (const purpose of ['verify', 'reset']) { const email = accountEmail({ origin: production.APP_ORIGIN, purpose, token: 'sensitive-link-token' }); assert.match(email.text, /Your Day, Your Way\./); assert.match(email.html, /Dayora/); assert.match(email.text, /Firebase Authentication email-action expiry policy/); assert.ok(email.html.includes(`#${purpose === 'verify' ? 'verify-email' : 'reset-password'}?token=`)) }
  const logs = [], mailer = createMailer(readConfig(production), { transport: { sendMail: async () => { throw new Error('smtp://secret:password@host sensitive-link-token') } }, log: (event) => logs.push(event) })
  await assert.rejects(mailer({ email: 'private@example.com', purpose: 'reset', token: 'sensitive-link-token' }), /Email delivery unavailable/)
  assert.match(logs.join(''), /mail_failed/); assert.ok(!/secret|password|sensitive-link-token|private@example/.test(logs.join('')))
})

test('deployment CSP allows only the exact API and Firebase Authentication service origins', async () => {
  for (const value of ['http://api.example', 'https://api.example/path', 'https://secret:password@api.example', 'https://api.example?x=1']) assert.throws(() => apiOrigin(value))
  const next = configureHeaders(JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8')), apiOrigin('https://api.dayora.example'))
  const policy = next.headers[0].headers.find((entry) => entry.key === 'Content-Security-Policy').value
  assert.ok(policy.includes("connect-src 'self' https://api.dayora.example https://identitytoolkit.googleapis.com https://securetoken.googleapis.com;"))
  assert.ok(policy.includes("img-src 'self' data: blob: https://api.dayora.example;")); assert.ok(!policy.includes("'self' https:;"))
})

test('shared Firestore rate limiter is atomic across instances and expires independently of TTL cleanup', { timeout: 30000 }, async (t) => {
  const { firebase } = await backend(t), first = new FirestoreRateLimitStore('test-shared'), second = new FirestoreRateLimitStore('test-shared')
  first.init({ windowMs: 60000 }); second.init({ windowMs: 60000 })
  const hits = await Promise.all(Array.from({ length: 6 }, (_value, index) => (index % 2 ? first : second).increment('192.0.2.15')))
  assert.equal(Math.max(...hits.map((hit) => hit.totalHits)), 6)
  const rows = await firebase.db.collection('rateLimits').get(); assert.equal(rows.size, 1); assert.ok(!rows.docs[0].id.includes('192.0.2.15'))
  await rows.docs[0].ref.update({ expiresAt: new Date(0) }); assert.equal((await second.increment('192.0.2.15')).totalHits, 1)
  await first.decrement('192.0.2.15'); await first.resetKey('192.0.2.15'); assert.equal((await firebase.db.collection('rateLimits').get()).size, 0)
})

test('readiness, JSON/origin hardening and SMTP outages do not disclose accounts', async (t) => {
  const { account, config } = await backend(t), alice = await account('Alice')
  const auth = createAuth({ config, mailer: async () => { throw new Error('private mail outage') } }), app = createApp({ config, readiness: async () => false, routes: [auth.router] })
  assert.equal((await request(app).get('/api/health/ready')).status, 503)
  assert.equal((await request(app).get('/api/health/live')).status, 200)
  assert.equal((await request(app).post('/api/auth/login').set('Origin', config.APP_ORIGIN).type('form').send('email=secret')).status, 415)
  assert.equal((await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send({})).status, 403)
  const reset = (email) => request(app).post('/api/auth/forgot-password').set('Origin', config.APP_ORIGIN).send({ email })
  const existing = await reset(alice.user.email), absent = await reset('absent@example.com'); assert.equal(existing.status, 202); assert.deepEqual(existing.body, absent.body)
})

test('incremental Firestore writes preserve unchanged records and restore inspection detects scope corruption', async (t) => {
  const { account } = await backend(t), alice = await account('Alice'), id = randomUUID()
  let state = (await alice.send('put', '/workspace/projects', { revision: 0, data: [{ id, name: 'Persisted', description: '', status: 'Pending', deadline: '' }] })).body
  const original = state.collections.projects[0]
  state = (await alice.send('put', '/workspace/projects', { revision: state.revision, data: [original] })).body
  assert.deepEqual(state.collections.projects[0], original)
  assert.deepEqual((await alice.agent.get(`/api/workspace?revision=${state.revision}`)).body, { revision: state.revision, unchanged: true })
  const summary = await checkRestoredData(); assert.equal(summary.users, 1); assert.equal(summary.records.projects, 1)
  await recordsRef(alice.user, 'projects').doc(id).update({ ownerId: 'foreign-owner' })
  await assert.rejects(checkRestoredData(), /ownership metadata/)
})

test('smoke tooling defaults to read-only and exercises authenticated CRUD with cleanup', { timeout: 30000 }, async (t) => {
  const { app, account, config } = await backend(t, (auth) => [createAdminRoutes(auth)]), owner = await account('Smoke')
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve)); t.after(() => new Promise((resolve) => server.close(resolve)))
  const env = { SMOKE_API_URL: `http://127.0.0.1:${server.address().port}`, SMOKE_FRONTEND_URL: config.APP_ORIGIN, SMOKE_ALLOW_HTTP: 'true' }
  assert.throws(() => smokeConfig({ ...env, SMOKE_CRUD: 'true' }), /CRUD requires/); assert.throws(() => smokeConfig({ ...env, NODE_ENV: 'production' }), /HTTPS/)
  const logs = [], fetcher = (url, options) => url === config.APP_ORIGIN ? Promise.resolve(new Response('<title>Dayora</title>')) : fetch(url, options)
  await runSmoke(smokeConfig(env), { fetcher, report: (line) => logs.push(line) }); assert.ok(logs.some((line) => line.startsWith('SKIP authenticated')))
  await runSmoke(smokeConfig({ ...env, SMOKE_EMAIL: owner.user.email, SMOKE_PASSWORD: 'a strong testing password 123', SMOKE_CRUD: 'true', SMOKE_CONFIRM: 'USE_EMPTY_TEST_WORKSPACE' }), { fetcher, report: (line) => logs.push(line) })
  assert.equal((await recordsRef(owner.user, 'projects').get()).size, 0); assert.equal((await recordsRef(owner.user, 'tasks').get()).size, 0)
  assert.ok(logs.includes('PASS logout invalidation')); assert.ok(!logs.join('').includes(owner.user.email))
})
