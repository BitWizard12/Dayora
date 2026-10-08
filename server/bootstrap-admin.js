import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { readConfig } from './config.js'
import { initializeFirebase, closeFirebase, getFirebase } from './firebaseAdmin.js'
import { ensureAccount, userRef, auditRef } from './firebaseRepositories.js'
import { runOperation, OperationalError } from './operations.js'

export async function bootstrapAdministrator({ email, uid, confirm }) {
  if ((!email && !uid) || confirm !== 'GRANT_FIRST_ADMIN') throw new OperationalError('Set ADMIN_BOOTSTRAP_EMAIL or ADMIN_BOOTSTRAP_UID and ADMIN_BOOTSTRAP_CONFIRM=GRANT_FIRST_ADMIN.')
  const { auth, db } = getFirebase()
  let identity
  try { identity = uid ? await auth.getUser(uid) : await auth.getUserByEmail(email.trim().toLowerCase()) } catch { throw new OperationalError('An existing verified active Firebase account is required.') }
  if (!identity.emailVerified || identity.disabled) throw new OperationalError('An existing verified active Firebase account is required.')
  await ensureAccount(identity)
  await db.runTransaction(async (transaction) => {
    const guard = db.doc('system/adminGuard'), current = await transaction.get(guard), admins = await transaction.get(db.collection('users').where('role', '==', 'admin')), user = await transaction.get(userRef(identity.uid))
    if (!admins.empty) throw new OperationalError('An administrator already exists. Use the authenticated admin workflow.')
    if (!user.data()?.active) throw new OperationalError('An existing verified active Firebase account is required.')
    transaction.set(guard, { revision: (current.data()?.revision || 0) + 1 })
    transaction.update(userRef(identity.uid), { role: 'admin', sessionVersion: user.data().sessionVersion + 1 })
    transaction.create(auditRef(), { actorId: 'server-bootstrap', targetId: identity.uid, action: 'first_admin_bootstrap', changes: { role: 'admin' }, createdAt: Date.now() })
  })
  await auth.revokeRefreshTokens(identity.uid)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runOperation('admin_bootstrap', async () => {
  initializeFirebase(readConfig())
  try { await bootstrapAdministrator({ email: process.env.ADMIN_BOOTSTRAP_EMAIL, uid: process.env.ADMIN_BOOTSTRAP_UID, confirm: process.env.ADMIN_BOOTSTRAP_CONFIRM }); console.info('First administrator granted. Sign in again to open Dayora Admin.') }
  finally { await closeFirebase() }
})
