import test from 'node:test'
import assert from 'node:assert/strict'
import { backend } from './helpers/backend.js'
import { importReviewedExport } from '../server/import-export.js'
import { getFirebase } from '../server/firebaseAdmin.js'

test('reviewed offline migration preserves stable IDs, links, ordering and unknown history without implicit uploads', async (t) => {
  const { account } = await backend(t), alice = await account('Alice')
  const scope = { ownerId: 'old-owner', workspaceId: 'old-workspace', createdAt: null, updatedAt: null }
  const input = { version: 1, accounts: [{ sourceOwnerId: scope.ownerId, sourceWorkspaceId: scope.workspaceId, firebaseUid: alice.user.id, collections: {
    projects: [{ ...scope, id: 'legacy-project', name: 'Legacy', description: '', status: 'Pending', deadline: '' }],
    team: [{ ...scope, id: 'legacy-member', name: 'Legacy Member', email: 'legacy@example.com', role: 'Engineer' }],
    tasks: [{ ...scope, id: 'legacy-task', title: 'Preserved', status: 'Done', priority: 'High', projectId: 'legacy-project', assigneeIds: ['legacy-member'], completedAt: null, position: 4, subtasks: [{ id: 'legacy-subtask', title: 'Checklist', completed: true }] }],
  } }], audits: [{ id: 'legacy-audit', actorId: 'server-bootstrap', targetId: 'old-owner', action: 'first_admin_bootstrap', changes: { role: 'admin' }, createdAt: 1000 }] }
  assert.equal((await importReviewedExport(input)).mode, 'dry-run')
  assert.equal((await alice.agent.get('/api/workspace')).body.revision, 0)
  const invalid = structuredClone(input); invalid.accounts[0].collections.tasks[0].ownerId = 'foreign'
  await assert.rejects(importReviewedExport(invalid), /ownership metadata/)
  await importReviewedExport(input, { confirm: 'IMPORT_REVIEWED_EXPORT' })
  const { collections } = (await alice.agent.get('/api/workspace')).body, task = collections.tasks[0]
  assert.equal(task.id, 'legacy-task'); assert.equal(task.projectId, 'legacy-project'); assert.deepEqual(task.assigneeIds, ['legacy-member']); assert.equal(task.subtasks[0].id, 'legacy-subtask'); assert.equal(task.position, 4); assert.equal(task.completedAt, null); assert.equal(task.createdAt, null); assert.equal(task.ownerId, alice.user.id)
  const audit = (await getFirebase().db.doc('adminAudits/legacy-audit').get()).data()
  assert.equal(audit.targetId, alice.user.id); assert.equal(audit.createdAt, 1000)
  assert.equal((await getFirebase().db.doc(`users/${alice.user.id}`).get()).data().role, 'user')
  await assert.rejects(importReviewedExport(input, { confirm: 'IMPORT_REVIEWED_EXPORT' }), /new and empty/)
})
