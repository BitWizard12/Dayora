import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { backend } from './helpers/backend.js'
import { createAdminRoutes } from '../server/admin.js'
import { accountByUid, userRef } from '../server/firebaseRepositories.js'

test('Firebase admin authorization, metadata-only management, reauthentication, audit and deactivation', { timeout: 60000 }, async (t) => {
  const { account, firebase } = await backend(t, (auth) => [createAdminRoutes(auth)])
  const alice = await account('Alice'), admin = await account('Admin', 'admin'), second = await account('Second', 'admin')
  assert.equal((await alice.agent.get('/api/admin/overview')).status, 403)
  await alice.send('put', '/workspace/projects', { revision: 0, data: [{ id: randomUUID(), name: 'Private customer work', status: 'Pending', deadline: '' }] })
  const users = await admin.agent.get('/api/admin/users')
  assert.equal(users.status, 200); assert.equal(users.body.total, 3)
  assert.ok(!JSON.stringify(users.body).includes('workspaceId')); assert.ok(!JSON.stringify(users.body).includes('Private customer work'))
  assert.equal((await admin.agent.get('/api/admin/overview')).body.total, 3)
  assert.equal((await admin.agent.get('/api/workspace')).body.collections.projects.length, 0)
  const mutate = (id, changes, password = 'a strong testing password 123') => admin.send('patch', `/admin/users/${id}`, { ...changes, currentPassword: password, reason: 'Access review' })
  assert.equal((await mutate(admin.user.id, { active: false })).status, 400)
  assert.equal((await mutate(alice.user.id, { active: false }, 'incorrect')).status, 401)
  assert.equal((await mutate(alice.user.id, { active: false })).status, 200)
  assert.equal((await alice.agent.get('/api/auth/session')).status, 401)
  assert.equal((await firebase.auth.getUser(alice.user.id)).disabled, true)
  assert.equal((await mutate(second.user.id, { role: 'user' })).status, 200)
  assert.equal((await second.agent.get('/api/admin/overview')).status, 401)
  const audit = (await admin.agent.get('/api/admin/audit')).body
  assert.equal(audit.total, 2); assert.ok(audit.entries.every((entry) => entry.changes.reason === 'Access review'))
  assert.equal((await mutate(alice.user.id, { active: true })).status, 200)
  assert.equal((await firebase.auth.getUser(alice.user.id)).disabled, false)
  assert.equal((await alice.agent.post('/api/auth/login').set('Origin', 'http://localhost:5173').send({ email: alice.user.email, password: 'a strong testing password 123' })).status, 200)
})

test('Firebase synchronization failure leaves Firestore deactivation and session revocation enforced', async (t) => {
  const { account, firebase } = await backend(t, (auth) => [createAdminRoutes(auth)])
  const admin = await account('Admin', 'admin'), alice = await account('Alice')
  const original = firebase.auth.updateUser
  firebase.auth.updateUser = async () => { throw new Error('provider-private-error') }
  let response
  try { response = await admin.send('patch', `/admin/users/${alice.user.id}`, { active: false, currentPassword: 'a strong testing password 123', reason: 'Fail-closed test' }) }
  finally { firebase.auth.updateUser = original }
  assert.equal(response.status, 503); assert.equal(response.body.error.code, 'ACCOUNT_SYNC_PENDING'); assert.ok(!JSON.stringify(response.body).includes('provider-private-error'))
  assert.equal((await alice.agent.get('/api/auth/session')).status, 401)
  const user = await accountByUid(alice.user.id); assert.equal(user.active, false); assert.equal(user.firebaseSyncPending, true)
  assert.equal((await admin.agent.get('/api/admin/audit')).body.total, 1)
})

test('concurrent administrator demotions retain an active administrator using Firestore guard transactions', { timeout: 60000 }, async (t) => {
  const { account } = await backend(t, (auth) => [createAdminRoutes(auth)])
  const first = await account('First', 'admin'), second = await account('Second', 'admin')
  const changes = { role: 'user', currentPassword: 'a strong testing password 123', reason: 'Concurrent access review' }
  const results = await Promise.all([first.send('patch', `/admin/users/${second.user.id}`, changes), second.send('patch', `/admin/users/${first.user.id}`, changes)])
  assert.equal(results.filter((result) => result.status === 200).length, 1)
  const users = await Promise.all([accountByUid(first.user.id), accountByUid(second.user.id)])
  assert.equal(users.filter((user) => user.active && user.role === 'admin').length, 1)
  assert.ok((await userRef(first.user.id).get()).exists)
})
