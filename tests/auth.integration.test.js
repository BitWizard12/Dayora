import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { backend } from './helpers/backend.js'
import { userRef, sessionRef } from '../server/firebaseRepositories.js'
import { hashToken } from '../server/auth.js'

test('Firebase signup, verification, single-use reset, cookie sessions and private workspaces', { timeout: 60000 }, async (t) => {
  const { app, config, mail, firebase } = await backend(t), agent = request.agent(app)
  const post = (path, body) => agent.post(`/api/auth/${path}`).set('Origin', config.APP_ORIGIN).send(body)
  const input = { name: 'Signup', email: 'SIGNUP@example.com', password: 'a strong testing password 123' }
  assert.equal((await post('signup', { ...input, role: 'admin' })).status, 400)
  assert.equal((await post('signup', input)).status, 202)
  assert.equal((await post('login', { email: input.email, password: input.password })).status, 401)
  assert.equal((await post('resend-verification', { email: input.email })).status, 202)
  const verification = mail.at(-1)
  assert.equal(verification.purpose, 'verify')
  assert.equal((await post('verify-email', { token: verification.token })).status, 200)
  assert.equal((await firebase.auth.getUserByEmail('signup@example.com')).emailVerified, true)
  assert.equal((await post('verify-email', { token: verification.token })).status, 400)
  const login = await post('login', { email: input.email, password: input.password, remember: true })
  assert.equal(login.status, 200); assert.equal(login.body.user.email, 'signup@example.com'); assert.equal(login.body.user.role, 'user')
  assert.ok(!JSON.stringify(login.body).includes('password'))
  for (const cookie of login.headers['set-cookie']) { assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Max-Age=1209600/); assert.ok(!cookie.includes('Domain=')) }
  const uid = login.body.user.id, sessions = await userRef(uid).collection('sessions').get()
  assert.equal(sessions.size, 1); assert.equal(sessions.docs[0].data().cookieHash.length, 64)
  assert.ok(Object.values((await agent.get('/api/workspace')).body.collections).every((rows) => !rows.length))
  assert.equal((await post('logout', {})).status, 403)
  assert.equal((await agent.get('/api/auth/session')).status, 200)
  assert.equal((await post('forgot-password', { email: input.email })).status, 202)
  const reset = mail.find((item) => item.purpose === 'reset')
  assert.equal((await post('reset-password', { token: reset.token, password: 'a different password now 789' })).status, 200)
  assert.equal((await post('reset-password', { token: reset.token, password: 'another different password 789' })).status, 400)
  assert.equal((await userRef(uid).collection('sessions').get()).size, 0)
  assert.equal((await post('login', { email: input.email, password: input.password })).status, 401)
  assert.equal((await post('login', { email: input.email, password: 'a different password now 789' })).status, 200)
  assert.equal((await firebase.auth.getUser(uid)).emailVerified, true)
})

test('Firebase session expiry, logout replay, missing cookie key and unknown reset responses', { timeout: 60000 }, async (t) => {
  const { app, config, account } = await backend(t), alice = await account('Alice')
  const sessions = await userRef(alice.user.id).collection('sessions').get()
  const key = sessions.docs[0].id
  await sessionRef(alice.user.id, key).update({ expiresAt: new Date(0) })
  assert.equal((await alice.agent.get('/api/auth/session')).status, 401)
  assert.equal((await sessionRef(alice.user.id, key).get()).exists, true, 'Expired session remains stored without TTL but cannot authenticate')
  const agent = request.agent(app), login = await agent.post('/api/auth/login').set('Origin', config.APP_ORIGIN).send({ email: alice.user.email, password: 'a strong testing password 123' })
  const cookies = login.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ')
  assert.equal((await request(app).get('/api/auth/session').set('Cookie', cookies.split('; ')[0])).status, 401)
  assert.equal((await agent.post('/api/auth/logout').set('Origin', config.APP_ORIGIN).set('X-CSRF-Token', login.body.csrf).send({})).status, 200)
  assert.equal((await request(app).get('/api/auth/session').set('Cookie', cookies)).status, 401)
  const csrfHash = hashToken('not-an-authentication-token'); assert.equal(csrfHash.length, 64)
  const reset = (email) => request(app).post('/api/auth/forgot-password').set('Origin', config.APP_ORIGIN).send({ email })
  assert.deepEqual((await reset(alice.user.email)).body, (await reset('unknown@example.com')).body)
})
