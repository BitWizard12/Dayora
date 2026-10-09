import { randomUUID } from 'node:crypto'
import { getFirebase } from './firebaseAdmin.js'
import { ApiError } from './errors.js'

export const collections = ['projects', 'tasks', 'events', 'team', 'time-entries', 'daily-notes', 'notifications', 'settings', 'profile-photo']
const names = { 'time-entries': 'timeEntries', 'profile-photo': 'profilePhotos' }
export function userRef(uid) { if (!uid || uid.includes('/') || uid.length > 128) throw new ApiError(400, 'INVALID_INPUT', 'Invalid account identifier.'); return getFirebase().db.collection('users').doc(uid) }
export const workspaceRef = (user) => userRef(user.workspaceOwnerId || user.id).collection('workspaces').doc(user.workspaceId)
export function recordsRef(user, collection) { if (!collections.includes(collection)) throw new ApiError(404, 'NOT_FOUND', 'Collection not found.'); return workspaceRef(user).collection(names[collection] || collection) }
export const sessionRef = (uid, key) => userRef(uid).collection('sessions').doc(key)
export const auditRef = () => getFirebase().db.collection('adminAudits').doc(randomUUID())
export async function ensureAccount(authUser) {
  const { db } = getFirebase(), ref = userRef(authUser.uid)
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (snapshot.exists) return { id: authUser.uid, ...snapshot.data() }
    const now = Date.now(), workspaceId = randomUUID()
    const user = { name: authUser.displayName || authUser.email.split('@')[0], email: authUser.email.toLowerCase(), role: 'user', active: !authUser.disabled,
      verifiedAt: authUser.emailVerified ? now : null, workspaceId, onboardingComplete: false, sessionVersion: 0, about: '', jobTitle: '', photo: '', createdAt: Date.parse(authUser.metadata.creationTime) || null, lastLoginAt: null }
    transaction.create(ref, user)
    transaction.create(ref.collection('workspaces').doc(workspaceId), { ownerId: authUser.uid, workspaceId, name: `${user.name}'s workspace`, revision: 0, createdAt: now })
    return { id: authUser.uid, ...user }
  })
}
export async function accountByUid(uid) { const snapshot = await userRef(uid).get(); return snapshot.exists ? { id: uid, ...snapshot.data() } : null }
export async function revokeAccountSessions(uid, { except } = {}) {
  const { db } = getFirebase()
  await db.runTransaction(async (transaction) => {
    const user = await transaction.get(userRef(uid)), sessions = await transaction.get(userRef(uid).collection('sessions').limit(400))
    const kept = except ? await transaction.get(sessionRef(uid, except)) : null
    if (!user.exists) return
    const version = (user.data().sessionVersion || 0) + 1
    transaction.update(userRef(uid), { sessionVersion: version })
    if (kept?.exists) transaction.update(kept.ref, { version })
    for (const doc of sessions.docs) if (doc.id !== except) transaction.delete(doc.ref)
  })
}
