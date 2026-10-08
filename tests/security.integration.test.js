import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { backend } from './helpers/backend.js'
import { createApp } from '../server/app.js'
import { createAuth } from '../server/auth.js'
import { readConfig } from '../server/config.js'
import { accountByUid, userRef } from '../server/firebaseRepositories.js'
import { firebaseAuthRequest } from '../server/firebaseAuthApi.js'

test('Firebase provider outages return safe retryable errors without misreporting valid sessions as expired', async (t) => {
  const { account, firebase } = await backend(t), alice = await account('Alice'), verify = firebase.auth.verifySessionCookie
  firebase.auth.verifySessionCookie = async () => { const error = new Error('private provider detail'); error.code = 'auth/internal-error'; throw error }
  try { const response = await alice.agent.get('/api/auth/session'); assert.equal(response.status, 503); assert.equal(response.body.error.code, 'AUTH_UNAVAILABLE'); assert.ok(!JSON.stringify(response.body).includes('private provider detail')) }
  finally { firebase.auth.verifySessionCookie = verify }
  assert.equal((await alice.agent.get('/api/auth/session')).status, 200)
})

test('Firebase password changes invalidate all devices and profile scope/role injection fails', { timeout: 60000 }, async (t) => {
  const { account, app, config } = await backend(t), alice = await account('Alice'), second = request.agent(app)
  await second.post('/api/auth/login').set('Origin', config.APP_ORIGIN).send({ email: alice.user.email, password: 'a strong testing password 123' })
  assert.equal((await alice.send('patch', '/auth/profile', { name: 'Updated', about: '', jobTitle: '', photo: '', role: 'admin' })).status, 400)
  assert.equal((await alice.send('patch', '/auth/profile', { name: 'Updated', about: 'Saved', jobTitle: 'Engineer', photo: '' })).status, 200)
  assert.equal((await accountByUid(alice.user.id)).role, 'user')
  assert.equal((await alice.send('post', '/auth/logout-others', {})).status, 200)
  assert.equal((await second.get('/api/auth/session')).status, 401)
  assert.equal((await alice.agent.get('/api/auth/session')).status, 200)
  assert.equal((await alice.send('post', '/auth/change-password', { currentPassword: 'a strong testing password 123', password: 'a different strong password 789' })).status, 200)
  assert.equal((await alice.agent.get('/api/auth/session')).status, 401)
  assert.equal((await userRef(alice.user.id).collection('sessions').get()).size, 0)
  assert.equal((await alice.agent.post('/api/auth/login').set('Origin', config.APP_ORIGIN).send({ email: alice.user.email, password: 'a different strong password 789' })).status, 200)
})

test('invalid Firebase action codes and rate-limited login/reset attempts are rejected', { timeout: 60000 }, async (t) => {
  const { app, config } = await backend(t), agent = request.agent(app)
  const post = (route, body) => agent.post(`/api/auth/${route}`).set('Origin', config.APP_ORIGIN).send(body)
  assert.equal((await post('verify-email', { token: 'invalid-action-code' })).status, 400)
  for (let index = 0; index < 15; index++) assert.equal((await post('login', { email: 'absent@example.com', password: 'incorrect' })).status, 401)
  assert.equal((await post('login', { email: 'absent@example.com', password: 'incorrect' })).status, 429)
  for (let index = 0; index < 9; index++) assert.equal((await post('forgot-password', { email: 'absent@example.com' })).status, 202)
  assert.equal((await post('forgot-password', { email: 'absent@example.com' })).status, 429)
})

test('Firebase session exchange enforces production cookie attributes, HTTPS, exact CORS and safe errors', { timeout: 60000 }, async (t) => {
  const { account, config: emulator } = await backend(t), alice = await account('Alice')
  const identity = await firebaseAuthRequest(emulator, 'signInWithPassword', { email: alice.user.email, password: 'a strong testing password 123', returnSecureToken: true })
  const config = readConfig({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'dayora-production', FIREBASE_WEB_API_KEY: 'public-config', FIREBASE_SERVICE_ACCOUNT_JSON: '{}', FIREBASE_STORAGE_BUCKET: 'dayora-production.firebasestorage.app', APP_ORIGIN: 'https://app.dayora.example', COOKIE_SAME_SITE: 'none', TRUST_PROXY: '1', MAIL_MODE: 'smtp', SMTP_URL: 'smtps://smtp.example.com:465', MAIL_FROM: 'Dayora <hello@dayora.example>' })
  const auth = createAuth({ config, mailer: async () => {} }), app = createApp({ config, routes: [auth.router] })
  assert.equal((await request(app).get('/api/auth/session')).status, 400)
  const login = await request(app).post('/api/auth/login').set('Origin', config.APP_ORIGIN).set('X-Forwarded-Proto', 'https').send({ idToken: identity.idToken, remember: true })
  assert.equal(login.status, 200)
  for (const cookie of login.headers['set-cookie']) { assert.match(cookie, /^__Host-dayora/); assert.match(cookie, /Secure/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=None/); assert.match(cookie, /Max-Age=1209600/) }
  assert.equal(login.headers['access-control-allow-origin'], config.APP_ORIGIN); assert.equal(login.headers['access-control-allow-credentials'], 'true')
  const invalid = await request(app).post('/api/auth/login').set('Origin', config.APP_ORIGIN).set('X-Forwarded-Proto', 'https').set('Content-Type', 'application/json').send('{"password":"secret"')
  assert.equal(invalid.status, 400); assert.ok(!JSON.stringify(invalid.body).includes('secret'))
})

test('two Firebase signups retain distinct private workspaces and normalized unique emails', { timeout: 60000 }, async (t) => {
  const { app, config, mail, firebase } = await backend(t), users = []
  for (let index = 0; index < 2; index++) {
    const agent = request.agent(app), email = `public${index}@example.com`, password = 'a strong public password 123'
    const post = (path, body) => agent.post(`/api/auth/${path}`).set('Origin', config.APP_ORIGIN).send(body)
    assert.equal((await post('signup', { email, password, name: `Public ${index}` })).status, 202)
    assert.equal((await post('verify-email', { token: mail.find((message) => message.email === email).token })).status, 200)
    const login = await post('login', { email, password }); assert.equal(login.status, 200); users.push(login.body.user)
    assert.ok(Object.values((await agent.get('/api/workspace')).body.collections).every((rows) => !rows.length))
  }
  assert.notEqual(users[0].id, users[1].id); assert.notEqual(users[0].workspaceId, users[1].workspaceId)
  const duplicate = await request(app).post('/api/auth/signup').set('Origin', config.APP_ORIGIN).send({ email: 'PUBLIC0@example.com', name: 'Duplicate', password: 'another strong password 123' })
  assert.equal(duplicate.status, 202); assert.equal((await firebase.auth.listUsers()).users.length, 2)
})
