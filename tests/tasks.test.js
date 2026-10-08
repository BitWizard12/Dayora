import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceRepositories } from '../src/repositories/workspaceRepositories.js'
import { filterTasks, subtaskProgress } from '../src/services/tasks.js'
const adapter = () => { const values = new Map(); return { read: (key) => values.get(key), write: (key, value) => values.set(key, structuredClone(value)) } }
test('task edits, subtasks, completion and reordering preserve scope and survive reload', async () => {
  const store = adapter(), scope = { ownerId: 'test', workspaceId: 'tasks' }
  const repos = createWorkspaceRepositories(scope, store)
  const project = await repos.projects.save({ name: 'Release' })
  const fields = { title: 'Ship', priority: 'Urgent', status: 'To do', dueDate: '2026-10-07', projectId: project.id, description: 'Release checklist' }
  const task = await repos.tasks.saveTask(fields)
  await repos.tasks.addSubtask(task.id, 'Review')
  const sub = repos.tasks.getSnapshot().data[0].subtasks[0]
  assert.ok(sub.id)
  await repos.tasks.changeSubtask(task.id, sub.id, true)
  assert.equal(subtaskProgress(repos.tasks.getSnapshot().data[0]), 100)
  await repos.tasks.saveTask({ ...fields, title: 'Ship release' }, task.id)
  await repos.tasks.move(task.id, 'Done')
  const restored = createWorkspaceRepositories(scope, store)
  await restored.tasks.load()
  const saved = restored.tasks.getSnapshot().data[0]
  assert.equal(saved.status, 'Done'); assert.equal(saved.ownerId, scope.ownerId); assert.equal(saved.createdAt, task.createdAt)
  assert.equal(saved.subtasks[0].id, sub.id); assert.equal(saved.subtasks[0].completed, true)
  const second = await repos.tasks.saveTask({ ...fields, title: 'Second' })
  await repos.tasks.reorder(task.id, 'In progress', second.id)
  assert.equal(repos.tasks.getSnapshot().data.find((item) => item.id === task.id).status, 'In progress')
  await repos.tasks.remove(task.id)
  assert.equal(repos.tasks.getSnapshot().data.length, 1)
})
test('daily views, combined filters and search use actual dates and exclude completed work', () => {
  const records = [{ id: '1', title: 'Review', description: 'API', dueDate: '2026-10-06', status: 'To do', priority: 'Urgent', projectId: 'p', subtasks: [] },
    { id: '2', title: 'Old', dueDate: '2026-10-05', status: 'In progress', priority: 'Low' },
    { id: '3', title: 'Future', dueDate: '2026-10-07', status: 'Done' }, { id: '4', title: 'Next', dueDate: '2026-10-07', status: 'To do' }]
  for (const [view, id] of [['Today', '1'], ['Overdue', '2'], ['Completed', '3'], ['Upcoming', '4']]) assert.deepEqual(filterTasks(records, { view }, '2026-10-06').map((item) => item.id), [id])
  assert.equal(filterTasks(records, { search: 'api', priority: 'Urgent', project: 'p', deadline: '2026-10-06' }).length, 1)
})
test('invalid task data and foreign project links are rejected', async () => {
  const repos = createWorkspaceRepositories({ ownerId: 'test', workspaceId: 'validation' }, adapter())
  const fields = { title: 'Task', status: 'To do', priority: 'High', dueDate: '' }
  await assert.rejects(repos.tasks.saveTask({ ...fields, projectId: 'foreign' }), /workspace/)
  await assert.rejects(repos.tasks.saveTask({ ...fields, dueDate: '2026-02-30' }), /deadline/)
  await assert.rejects(repos.tasks.saveTask({ ...fields, title: '' }), /name/)
  await assert.rejects(repos.tasks.saveTask({ ...fields, priority: 'Unknown' }), /priority/)
})
