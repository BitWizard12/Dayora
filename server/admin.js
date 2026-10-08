import { Router } from 'express'
import { z } from 'zod'
import { getFirebase, createReadinessProbe } from './firebaseAdmin.js'
import { userRef, auditRef } from './firebaseRepositories.js'
import { ApiError } from './errors.js'

async function identities() {
  const { auth } = getFirebase(), users = []; let pageToken
  do { const page = await auth.listUsers(1000, pageToken); users.push(...page.users); pageToken = page.pageToken } while (pageToken)
  return users
}
export async function changeAccountAccess(actor, targetId, input) {
  const { db, auth } = getFirebase()
  const targetIdentity = await auth.getUser(targetId)
  await db.runTransaction(async (transaction) => {
    const guard = db.doc('system/adminGuard'), guardSnapshot = await transaction.get(guard)
    const actorSnapshot = await transaction.get(userRef(actor.id)), targetSnapshot = await transaction.get(userRef(targetId))
    const admins = await transaction.get(db.collection('users').where('role', '==', 'admin'))
    const sessions = await transaction.get(userRef(targetId).collection('sessions').limit(400))
    const currentActor = actorSnapshot.data(), target = targetSnapshot.data()
    if (!currentActor?.active || currentActor.role !== 'admin' || currentActor.sessionVersion !== actor.sessionVersion) throw new ApiError(403, 'FORBIDDEN', 'Administrator authorization changed.')
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'Account not found.')
    if (targetId === actor.id) throw new ApiError(400, 'SELF_CHANGE_REJECTED', 'Use another administrator to change your own access.')
    if (input.role === 'admin' && !targetIdentity.emailVerified) throw new ApiError(400, 'UNVERIFIED_ACCOUNT', 'Verify the account before granting administrator access.')
    if (target.role === 'admin' && target.active && (input.active === false || input.role === 'user') && admins.docs.filter((doc) => doc.data().active).length <= 1) throw new ApiError(409, 'LAST_ADMIN', 'The final active administrator must be retained.')
    const changes = { ...(input.active !== undefined ? { active: input.active } : {}), ...(input.role ? { role: input.role } : {}) }
    transaction.set(guard, { revision: (guardSnapshot.data()?.revision || 0) + 1 })
    transaction.update(userRef(targetId), { ...changes, sessionVersion: target.sessionVersion + 1, firebaseSyncPending: true })
    for (const session of sessions.docs) transaction.delete(session.ref)
    transaction.create(auditRef(), { actorId: actor.id, targetId, action: 'account_updated', changes: { before: { role: target.role, active: target.active }, after: changes, reason: input.reason }, createdAt: Date.now() })
  })
  // Firestore is the authoritative app-access boundary; failures here leave deactivation denied.
  try { if (input.active !== undefined) await auth.updateUser(targetId, { disabled: !input.active }); await auth.revokeRefreshTokens(targetId); await userRef(targetId).update({ firebaseSyncPending: false }) }
  catch { console.error(JSON.stringify({ event: 'firebase_account_sync_failed' })); throw new ApiError(503, 'ACCOUNT_SYNC_PENDING', 'Application access was updated; Firebase account synchronization needs a retry.') }
}
export function createAdminRoutes(auth) {
  const router = Router(), readiness = createReadinessProbe()
  router.use('/admin', auth.authenticate, auth.admin)
  router.get('/admin/overview', async (_req, res) => {
    const { db } = getFirebase(), [accounts, profiles, sessions] = await Promise.all([identities(), db.collection('users').get(), db.collectionGroup('sessions').where('expiresAt', '>', new Date()).get()])
    const records = new Map(profiles.docs.map((doc) => [doc.id, doc.data()]))
    res.json({ total: accounts.length, active: accounts.filter((user) => !user.disabled && records.get(user.uid)?.active !== false).length,
      verified: accounts.filter((user) => user.emailVerified).length, admins: profiles.docs.filter((doc) => doc.data().role === 'admin' && doc.data().active).length,
      signedIn: new Set(sessions.docs.filter((doc) => { const account = records.get(doc.ref.parent.parent.id); return account?.active && account.sessionVersion === doc.data().version }).map((doc) => doc.ref.parent.parent.id)).size, health: { database: await readiness() ? 'ready' : 'unavailable', uptimeSeconds: Math.floor(process.uptime()) } })
  })
  router.get('/admin/users', async (req, res) => {
    const search = z.string().max(100).parse(req.query.search || '').toLowerCase(), page = z.coerce.number().int().min(1).max(10000).parse(req.query.page || 1)
    const profiles = await getFirebase().db.collection('users').get(), records = new Map(profiles.docs.map((doc) => [doc.id, doc.data()]))
    const users = (await identities()).map((identity) => {
      const profile = records.get(identity.uid)
      return { id: identity.uid, name: profile?.name || identity.displayName || '', email: identity.email, role: profile?.role || 'user', active: !identity.disabled && profile?.active !== false,
        verifiedAt: identity.emailVerified ? profile?.verifiedAt || Date.parse(identity.metadata.creationTime) : null, createdAt: profile?.createdAt ?? Date.parse(identity.metadata.creationTime), lastLoginAt: profile?.lastLoginAt ?? null }
    }).filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || a.id.localeCompare(b.id))
    res.json({ users: users.slice((page - 1) * 25, page * 25), total: users.length, page })
  })
  router.get('/admin/audit', async (req, res) => {
    const page = z.coerce.number().int().min(1).max(10000).parse(req.query.page || 1), ref = getFirebase().db.collection('adminAudits')
    const [entries, total] = await Promise.all([ref.orderBy('createdAt', 'desc').offset((page - 1) * 25).limit(25).get(), ref.count().get()])
    res.json({ entries: entries.docs.map((doc) => ({ _id: doc.id, ...doc.data() })), total: total.data().count, page })
  })
  router.patch('/admin/users/:id', auth.csrf, async (req, res) => {
    const input = z.object({ active: z.boolean().optional(), role: z.enum(['user', 'admin']).optional(), reason: z.string().trim().min(3).max(500), currentPassword: z.string().min(1).max(128) }).strict().parse(req.body)
    if (input.active === undefined && input.role === undefined) throw new ApiError(400, 'INVALID_INPUT', 'Choose an account change.')
    if (req.params.id === req.user.id) throw new ApiError(400, 'SELF_CHANGE_REJECTED', 'Use another administrator to change your own access.')
    await auth.reauthenticate(req.user, input.currentPassword)
    await changeAccountAccess(req.user, req.params.id, input)
    res.json({ message: 'Account updated. Existing sessions were invalidated.' })
  })
  return router
}
