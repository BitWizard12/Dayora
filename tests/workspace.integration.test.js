import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { backend } from './helpers/backend.js'

test('HTTP workspace isolation, references, concurrency, atomic cleanup and persistence', { timeout: 30000 }, async (t) => {
  const { account } = await backend(t)
  const alice = await account('Alice'), bob = await account('Bob')
  let state = (await alice.agent.get('/api/workspace')).body
  assert.ok(Object.values(state.collections).every((rows) => !rows.length))
  const project = { id: randomUUID(), name: 'Private project', description: 'Only Alice', status: 'Pending', deadline: '2026-10-20', ownerId: bob.user.id, workspaceId: bob.user.workspaceId }
  const save = async (collection, data, expected = 200) => {
    const response = await alice.send('put', `/workspace/${collection}`, { revision: state.revision, data })
    assert.equal(response.status, expected, JSON.stringify(response.body))
    if (expected === 200) state = response.body
    return response
  }
  await save('projects', [project])
  assert.equal(state.collections.projects[0].ownerId, alice.user.id)
  assert.equal(state.collections.projects[0].workspaceId, alice.user.workspaceId)
  assert.equal((await bob.agent.get(`/api/workspace/projects/${project.id}`)).status, 404)
  assert.equal((await bob.agent.get(`/api/workspace?ownerId=${alice.user.id}`)).body.collections.projects.length, 0)
  const guessed = await bob.send('put', '/workspace/tasks', { revision: 0, data: [{ id: randomUUID(), title: 'Attack', status: 'To do', priority: 'Low', projectId: project.id }] })
  assert.equal(guessed.status, 400)
  const stale = await alice.send('put', '/workspace/projects', { revision: 0, data: [] })
  assert.equal(stale.status, 409)
  const member = { id: randomUUID(), name: 'Team Member', email: 'team@example.com', role: 'Engineer', department: 'Engineering' }
  await save('team', [member])
  const task = { id: randomUUID(), title: 'Private task', description: '', status: 'To do', priority: 'High', projectId: project.id, assigneeIds: [member.id], subtasks: [{ id: randomUUID(), title: 'Checklist', completed: false }], dueDate: '2026-10-15' }
  await save('tasks', [task])
  await save('tasks', [{ ...state.collections.tasks[0], assigneeIds: ['unknown'] }], 400)
  await save('team', [{ ...state.collections.team[0], name: 'Renamed Person' }])
  assert.deepEqual(state.collections.tasks[0].assignees, ['RP'])
  await save('tasks', [{ ...state.collections.tasks[0], status: 'Done', completedAt: 1 }])
  assert.ok(state.collections.tasks[0].completedAt > 1)
  await save('events', [{ id: randomUUID(), title: 'Review', date: '2026-10-15', time: '09:00', timeZone: 'Asia/Kolkata', durationMinutes: 60, projectId: project.id }])
  await save('time-entries', [{ id: randomUUID(), projectId: project.id, label: 'Focus', startedAt: 1000, endedAt: 5000, runningSince: null, segments: [{ start: 1000, end: 5000 }], duration: 4000 }])
  await save('team', [])
  assert.deepEqual(state.collections.tasks[0].assigneeIds, [])
  await save('projects', [])
  assert.equal(state.collections.tasks[0].projectId, null)
  assert.equal(state.collections.events[0].projectId, null)
  assert.equal(state.collections['time-entries'][0].projectId, project.id)
  const persisted = (await alice.agent.get('/api/workspace')).body
  assert.equal(persisted.collections.tasks[0].title, 'Private task')
  const device = await account('Other')
  assert.equal((await device.agent.get(`/api/workspace/tasks/${task.id}`)).status, 404)
  assert.equal((await alice.send('put', '/workspace/projects', { revision: state.revision, data: [{ ...project, deadline: '2026-02-30' }] })).status, 400)
})

test('explicit anonymous migration remaps linked IDs atomically and refuses nonempty accounts', { timeout: 30000 }, async (t) => {
  const { account } = await backend(t)
  const accountA = await account('Migrator')
  const input = { revision: 0, confirm: 'IMPORT INTO MY EMPTY WORKSPACE', collections: {
    projects: [{ id: 'legacy-project', name: 'Old project', status: 'In progress', deadline: '', createdAt: null }],
    team: [{ id: 'old-member', name: 'Local Person', email: 'local@example.com', role: 'Designer' }],
    tasks: [{ id: 'tasks:1', title: 'Old task', status: 'Done', priority: 'Medium', projectId: 'legacy-project', assigneeIds: ['old-member'], createdAt: null, completedAt: null, subtasks: [] }],
  } }
  assert.equal((await accountA.send('post', '/workspace/migrate', { ...input, confirm: 'no' })).status, 400)
  const migrated = await accountA.send('post', '/workspace/migrate', input)
  assert.equal(migrated.status, 200, JSON.stringify(migrated.body))
  const records = migrated.body.collections
  assert.notEqual(records.projects[0].id, 'legacy-project')
  assert.equal(records.tasks[0].projectId, records.projects[0].id)
  assert.equal(records.tasks[0].assigneeIds[0], records.team[0].id)
  assert.equal(records.tasks[0].createdAt, null)
  assert.equal(records.tasks[0].completedAt, null)
  assert.equal((await accountA.send('post', '/workspace/migrate', { ...input, revision: 1 })).status, 409)
})

test('Firestore snapshots retain collection ordering independently of document IDs', async (t) => {
  const { account } = await backend(t), alice = await account('Alice')
  const ids = [randomUUID(), randomUUID()].sort().reverse()
  const rows = ids.map((id, index) => ({ id, name: `Ordered ${index}`, description: '', status: 'Pending', deadline: '' }))
  const saved = await alice.send('put', '/workspace/projects', { revision: 0, data: rows }); assert.equal(saved.status, 200)
  assert.deepEqual((await alice.agent.get('/api/workspace')).body.collections.projects.map((row) => row.id), ids)
  assert.equal((await alice.send('put', '/workspace/projects', { revision: 1, data: [...saved.body.collections.projects].reverse() })).status, 200)
  assert.deepEqual((await alice.agent.get('/api/workspace')).body.collections.projects.map((row) => row.id), [...ids].reverse())
})
