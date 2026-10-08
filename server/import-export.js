import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { readConfig } from './config.js'
import { getFirebase, initializeFirebase, closeFirebase } from './firebaseAdmin.js'
import { accountByUid, collections } from './firebaseRepositories.js'
import { readWorkspace, preparePreservedImport, importPreservedWorkspace } from './records.js'
import { decodePhoto, mediaPattern } from './media.js'
import { runOperation, OperationalError } from './operations.js'

// JSON exported offline from the obsolete database. No MongoDB driver or live source connection.
export async function importReviewedExport(raw, { confirm } = {}) {
  const input = z.object({ version: z.literal(1), accounts: z.array(z.object({ sourceOwnerId: z.string().min(1), sourceWorkspaceId: z.string().min(1), firebaseUid: z.string().min(1).max(128), collections: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))) }).strict()).min(1).max(1000), audits: z.array(z.object({ id: z.string().min(1).max(150).regex(/^[\w:.-]+$/), actorId: z.string().min(1), targetId: z.string().min(1), action: z.string().min(1).max(100), changes: z.record(z.string(), z.unknown()), createdAt: z.number().finite().nonnegative().nullable() }).strict()).max(5000).default([]) }).strict().parse(raw)
  if (new Set(input.accounts.map((row) => row.firebaseUid)).size !== input.accounts.length || new Set(input.accounts.map((row) => row.sourceOwnerId)).size !== input.accounts.length) throw new OperationalError('Export ownership mappings must be one-to-one.')
  const prepared = []
  for (const row of input.accounts) {
    const identity = await getFirebase().auth.getUser(row.firebaseUid), user = await accountByUid(row.firebaseUid)
    if (!identity.emailVerified || identity.disabled || !user?.active) throw new OperationalError('Each target must be an existing verified active Dayora account.')
    const state = await readWorkspace(user)
    if (state.revision !== 0 || collections.some((name) => state.collections[name].length)) throw new OperationalError('Every target workspace must be new and empty.')
    for (const [name, records] of Object.entries(row.collections)) {
      if (!collections.includes(name)) throw new OperationalError('Unknown export collection.')
      for (const record of records) {
        if (record.ownerId !== row.sourceOwnerId || record.workspaceId !== row.sourceWorkspaceId) throw new OperationalError('Export ownership metadata does not match its reviewed mapping.')
        const photo = name === 'team' ? record.photo : name === 'profile-photo' ? record.value : null
        if (photo && !mediaPattern.test(photo)) decodePhoto(photo)
        if (photo && mediaPattern.test(photo) && !(await getFirebase().db.doc(`users/${user.id}/media/${photo.slice(6)}`).get()).exists) throw new OperationalError('An imported photo reference must already belong to the target account.')
      }
    }
    await preparePreservedImport(user, row.collections)
    prepared.push({ user, row })
  }
  const mapping = new Map(input.accounts.map((row) => [row.sourceOwnerId, row.firebaseUid])), historical = []
  if (new Set(input.audits.map((row) => row.id)).size !== input.audits.length) throw new OperationalError('Historical audit IDs must be unique.')
  for (const { id, actorId, targetId, ...audit } of input.audits) {
    if (!mapping.has(targetId) || !mapping.has(actorId) && !['bootstrap', 'server-bootstrap'].includes(actorId)) throw new OperationalError('Historical audit identities require reviewed owner mappings.')
    const ref = getFirebase().db.collection('adminAudits').doc(id)
    if ((await ref.get()).exists) throw new OperationalError('Historical audit ID already exists; refusing to overwrite history.')
    const data = { ...audit, actorId: mapping.get(actorId) || 'server-bootstrap', targetId: mapping.get(targetId), legacySource: { actorId, targetId } }
    if (Buffer.byteLength(JSON.stringify(data)) > 100000) throw new OperationalError('Historical audit entry is too large.')
    historical.push({ ref, data })
  }
  const summary = { accounts: prepared.length, records: prepared.reduce((sum, { row }) => sum + Object.values(row.collections).reduce((count, records) => count + records.length, 0), 0), historicalAudits: historical.length, mode: confirm === 'IMPORT_REVIEWED_EXPORT' ? 'import' : 'dry-run' }
  if (summary.mode === 'import') for (const { user, row } of prepared) {
    await importPreservedWorkspace(user, row.collections, { actorId: 'trusted-offline-import', targetId: user.id, action: 'workspace_imported', changes: { sourceOwnerId: row.sourceOwnerId, sourceWorkspaceId: row.sourceWorkspaceId, targetWorkspaceId: user.workspaceId, reason: 'Explicit reviewed legacy export import; IDs preserved.' }, createdAt: Date.now() })
  }
  if (summary.mode === 'import') for (let offset = 0; offset < historical.length; offset += 50) {
    const batch = getFirebase().db.batch()
    for (const { ref, data } of historical.slice(offset, offset + 50)) batch.create(ref, data)
    await batch.commit()
  }
  return summary
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runOperation('reviewed_export_import', async () => {
  if (!process.env.MIGRATION_INPUT_FILE) throw new OperationalError('Set MIGRATION_INPUT_FILE to a reviewed private JSON export. The default operation is a dry run.')
  initializeFirebase(readConfig())
  try { const input = JSON.parse(await readFile(process.env.MIGRATION_INPUT_FILE, 'utf8')); console.info(JSON.stringify({ event: 'reviewed_export', ...await importReviewedExport(input, { confirm: process.env.FIREBASE_MIGRATION_CONFIRM }) })) }
  finally { await closeFirebase() }
})
