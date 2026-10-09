import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { readConfig } from './config.js'
import { getFirebase, initializeFirebase, closeFirebase, verifyFirebase } from './firebaseAdmin.js'
import { collections, recordsRef, workspaceRef } from './firebaseRepositories.js'
import { runOperation, OperationalError } from './operations.js'

export async function checkRestoredData() {
  await verifyFirebase()
  const { db, auth } = getFirebase(), users = await db.collection('users').get()
  const counts = Object.fromEntries(collections.map((name) => [name, 0]))
  let sessions = 0, workspaces = 0
  for (const snapshot of users.docs) {
    const user = { ...snapshot.data(), id: snapshot.id }
    try { await auth.getUser(user.id) } catch { throw new OperationalError('Restore verification failed: a Firebase Authentication identity is missing.') }
    const workspace = await workspaceRef(user).get()
    if (!workspace.exists || workspace.data().ownerId !== user.id || workspace.data().workspaceId !== user.workspaceId) throw new OperationalError('Restore verification failed: workspace ownership links need repair.')
    workspaces++; sessions += (await db.collection(`users/${user.id}/sessions`).count().get()).data().count
    // Integrity inspection also covers inactive accounts; it is a trusted,
    // read-only staging operation, not an authenticated workspace request.
    const state = { collections: Object.fromEntries(await Promise.all(collections.map(async (name) => [name, (await recordsRef(user, name).get()).docs.map((row) => row.data())]))) }
    for (const collection of collections) {
      const rows = await recordsRef(user, collection).get()
      for (const row of rows.docs) {
        const data = row.data(); counts[collection]++
        if (data.id !== row.id || data.ownerId !== user.id || data.workspaceId !== user.workspaceId) throw new OperationalError('Restore verification failed: record ownership metadata is inconsistent.')
        if (data.projectId && ['tasks', 'events', 'notifications'].includes(collection) && !state.collections.projects.some((project) => project.id === data.projectId)) throw new OperationalError('Restore verification failed: a project relationship is missing.')
        if (collection === 'tasks' && (data.assigneeIds || []).some((id) => !state.collections.team.some((member) => member.id === id))) throw new OperationalError('Restore verification failed: a team assignment is missing.')
        const photo = collection === 'team' ? data.photo : collection === 'profile-photo' ? data.value : null
        if (photo && (!photo.startsWith('media:') || !(await db.doc(`users/${user.id}/media/${photo.slice(6)}`).get()).exists)) throw new OperationalError('Restore verification failed: image metadata is missing.')
      }
    }
  }
  const teams = await db.collection('workspaces').get()
  for (const snapshot of teams.docs) {
    const team = snapshot.data(), owner = users.docs.find((row) => row.id === team.ownerId)
    if (!owner || team.type !== 'team' || team.workspaceId !== snapshot.id || owner.data().workspaceId === snapshot.id) throw new OperationalError('Restore verification failed: team ownership metadata is inconsistent.')
    const members = await snapshot.ref.collection('members').get()
    if (members.size !== team.memberCount || members.docs.filter((row) => row.data().role === 'owner').length !== 1 || !(members.docs.find((row) => row.id === team.ownerId)?.data().role === 'owner')) throw new OperationalError('Restore verification failed: team membership roles need repair.')
    for (const member of members.docs) {
      if (!users.docs.some((row) => row.id === member.id) || !['owner', 'member'].includes(member.data().role) || !(await db.doc(`users/${member.id}/memberships/${snapshot.id}`).get()).exists) throw new OperationalError('Restore verification failed: a team membership pointer is missing.')
    }
    const scope = { id: team.ownerId, workspaceId: snapshot.id }, workspace = await workspaceRef(scope).get()
    if (!workspace.exists || workspace.data().ownerId !== team.ownerId || workspace.data().workspaceId !== snapshot.id) throw new OperationalError('Restore verification failed: team record storage is missing.')
    workspaces++
    for (const collection of collections) for (const row of (await recordsRef(scope, collection).get()).docs) {
      const data = row.data(); counts[collection]++
      if (data.id !== row.id || data.ownerId !== team.ownerId || data.workspaceId !== snapshot.id) throw new OperationalError('Restore verification failed: team record ownership metadata is inconsistent.')
      if (['time-entries', 'daily-notes'].includes(collection) && !users.docs.some((account) => account.id === data.authorId)) throw new OperationalError('Restore verification failed: a team work-log author is missing.')
    }
  }
  return { users: users.size, workspaces, records: counts, sessions }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runOperation('restore_check', async () => {
  if (process.env.RESTORE_CHECK_CONFIRM !== 'READ_RESTORED_STAGING_FIREBASE' || process.env.RESTORE_CHECK_PROJECT_ID !== process.env.FIREBASE_PROJECT_ID) throw new OperationalError('Set RESTORE_CHECK_CONFIRM=READ_RESTORED_STAGING_FIREBASE and matching RESTORE_CHECK_PROJECT_ID for a separate restored staging project.')
  initializeFirebase(readConfig())
  try { const summary = await checkRestoredData(); console.info(JSON.stringify({ event: 'restore_integrity_checked', ...summary })); if (summary.sessions) throw new OperationalError('Restored session registries remain. Remove/revoke them using trusted staging maintenance before allowing access.') }
  finally { await closeFirebase() }
})
