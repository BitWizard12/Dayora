import test from 'node:test'
import assert from 'node:assert/strict'
import { backend } from './helpers/backend.js'
import { bootstrapAdministrator } from '../server/bootstrap-admin.js'
import { accountByUid } from '../server/firebaseRepositories.js'

test('Firebase first-admin bootstrap requires verified active account/confirmation, refuses reuse and audits', { timeout: 60000 }, async (t) => {
  const { account, firebase } = await backend(t), owner = await account('Owner')
  await assert.rejects(bootstrapAdministrator({ email: owner.user.email }), /ADMIN_BOOTSTRAP_CONFIRM/)
  await firebase.auth.updateUser(owner.user.id, { emailVerified: false })
  await assert.rejects(bootstrapAdministrator({ email: owner.user.email, confirm: 'GRANT_FIRST_ADMIN' }), /verified active/)
  await firebase.auth.updateUser(owner.user.id, { emailVerified: true })
  await bootstrapAdministrator({ email: owner.user.email, confirm: 'GRANT_FIRST_ADMIN' })
  assert.equal((await accountByUid(owner.user.id)).role, 'admin')
  assert.equal((await owner.agent.get('/api/auth/session')).status, 401)
  await assert.rejects(bootstrapAdministrator({ uid: owner.user.id, confirm: 'GRANT_FIRST_ADMIN' }), /already exists/)
  const audit = await firebase.db.collection('adminAudits').get()
  assert.equal(audit.size, 1); assert.equal(audit.docs[0].data().action, 'first_admin_bootstrap')
})
