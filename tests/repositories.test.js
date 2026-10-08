import test from 'node:test'
import assert from 'node:assert/strict'
import { createRepository, localScope, storageKey } from '../src/repositories/createRepository.js'
import { createWorkspaceRepositories } from '../src/repositories/workspaceRepositories.js'
import fs from 'node:fs'
import path from 'node:path'

function memoryAdapter(initial = {}) {
  const data = new Map(Object.entries(initial))
  return { data, async read(key) { return structuredClone(data.get(key)) }, async write(key, value) { data.set(key, structuredClone(value)) } }
}

test('scopes isolate records and commands and cannot overwrite ownership', async () => {
  const adapter = memoryAdapter()
  const a = createWorkspaceRepositories({ ownerId: 'alice', workspaceId: 'private' }, adapter)
  const b = createWorkspaceRepositories({ ownerId: 'bob', workspaceId: 'private' }, adapter)
  const another = createWorkspaceRepositories({ ownerId: 'alice', workspaceId: 'another' }, adapter)
  const project = await a.projects.save({ name: 'Private project', status: 'Pending', deadline: '2026-10-21' })
  assert.match(project.id, /^[0-9a-f-]{36}$/)
  assert.equal(project.ownerId, 'alice')
  assert.deepEqual(await b.projects.load(), [])
  assert.deepEqual(await another.projects.load(), [])
  await assert.rejects(b.projects.update(project.id, { name: 'Wrong owner' }), /not found/)
  const updated = await a.projects.update(project.id, { ownerId: 'bob', workspaceId: 'another', createdAt: -1, name: 'Still private' })
  assert.equal(updated.ownerId, 'alice')
  assert.equal(updated.workspaceId, 'private')
  assert.equal(updated.createdAt, project.createdAt)
})

test('migrates old collections once, retaining IDs, links, pauses, and backup keys', async () => {
  const legacyProject = [{ id: 'existing-project', name: 'Existing', due: 'Oct 8, 2026' }]
  const adapter = memoryAdapter({ 'fernly-projects': legacyProject, 'fernly-events': { '2026-9-8': [{ label: 'Existing meeting', time: '14:00' }] },
    'fernly-tracker-v1': { active: { id: 'existing-time', projectId: 'existing-project', label: 'Existing', startedAt: 1000, runningSince: null, segments: [{ start: 1000, end: 4000 }] }, sessions: [] } })
  const repositories = createWorkspaceRepositories(localScope, adapter)
  const [projects, events, entries] = await Promise.all([repositories.projects.load(), repositories.events.load(), repositories.timeEntries.load()])
  assert.equal(projects[0].id, 'existing-project')
  assert.equal(projects[0].deadline, '2026-10-08')
  assert.equal(projects[0].createdAt, null)
  assert.equal(events[0].date, '2026-10-08')
  assert.equal(events[0].title, 'Existing meeting')
  assert.equal(entries[0].projectId, 'existing-project')
  assert.equal(entries[0].runningSince, null)
  assert.deepEqual(adapter.data.get('fernly-projects'), legacyProject)
  const restored = createWorkspaceRepositories(localScope, adapter)
  assert.deepEqual(await restored.events.load(), events)
  assert.deepEqual(await restored.timeEntries.load(), entries)
})

test('async commands serialize concurrent changes and publish only successful writes', async () => {
  const adapter = memoryAdapter()
  const repo = createRepository({ collection: 'items', scope: localScope, adapter })
  const records = await Promise.all(Array.from({ length: 12 }, (_, index) => repo.create({ name: `Record ${index}` })))
  assert.equal(repo.getSnapshot().data.length, 12)
  assert.equal(new Set(records.map((record) => record.id)).size, 12)
  const before = repo.getSnapshot().data
  adapter.write = async () => { throw new Error('Storage unavailable') }
  await assert.rejects(repo.create({ name: 'Not saved' }), /Storage unavailable/)
  assert.deepEqual(repo.getSnapshot().data, before)
  assert.equal(repo.getSnapshot().error.message, 'Storage unavailable')
})

test('all entity records are owned and flat; deletes retain tracked sessions', async () => {
  const repositories = createWorkspaceRepositories({ ownerId: 'future-user', workspaceId: 'workspace' }, memoryAdapter())
  const project = await repositories.projects.save({ name: 'New project', deadline: '2026-10-21' })
  const task = await repositories.tasks.createTask({ title: 'New task', projectId: project.id, due: 'Tomorrow' })
  await repositories.tasks.move(task.id, 'Done')
  const event = await repositories.events.createEvent({ title: 'Meeting', date: '2026-10-21', projectId: project.id })
  await repositories.timeEntries.act('start', 1000, project)
  await repositories.timeEntries.act('pause', 5000)
  await repositories.timeEntries.act('resume', 9000)
  await repositories.timeEntries.act('stop', 10000)
  const entry = repositories.timeEntries.getSnapshot().data[0]
  assert.equal(entry.duration, 5000)
  for (const record of [project, task, event, entry]) {
    assert.ok(record.id)
    assert.equal(record.ownerId, 'future-user')
    assert.equal(record.workspaceId, 'workspace')
    assert.equal(typeof record.createdAt, 'number')
  }
  await repositories.projects.remove(project.id)
  assert.equal(repositories.timeEntries.getSnapshot().data[0].projectId, project.id)
  assert.equal(repositories.tasks.getSnapshot().data[0].status, 'Done')
})

test('foreign records in a scoped payload are not exposed', async () => {
  const adapter = memoryAdapter({ [storageKey(localScope, 'items')]: { schemaVersion: 1, data: [{ id: 'foreign', ownerId: 'someone-else', workspaceId: 'private' }] } })
  const repo = createRepository({ collection: 'items', scope: localScope, adapter })
  assert.deepEqual(await repo.load(), [])
})

test('preferences and photo values use scoped records without changing their UI values', async () => {
  const adapter = memoryAdapter({ 'fernly-settings': { email: false }, 'fernly-profile-photo': 'data:image/png;base64,example' })
  const repositories = createWorkspaceRepositories(localScope, adapter)
  const settings = repositories.valueRepository('fernly-settings', { email: true })
  await settings.load()
  await settings.setValue((value) => ({ ...value, push: true }))
  assert.deepEqual(settings.getSnapshot().data[0].value, { email: false, push: true })
  const photo = repositories.valueRepository('fernly-profile-photo', '')
  assert.equal((await photo.load())[0].value, 'data:image/png;base64,example')
})

test('browser storage access remains confined to the persistence adapter', () => {
  const root = new URL('../src/', import.meta.url)
  const files = fs.readdirSync(root, { recursive: true }).filter((name) => /\.[jt]sx?$/.test(name))
  const storageAccess = files.filter((name) => /\blocalStorage\s*\./.test(fs.readFileSync(new URL(name.replaceAll(path.sep, '/'), root), 'utf8')))
  assert.deepEqual(storageAccess.map((name) => name.replaceAll(path.sep, '/')), ['services/localStorageAdapter.js'])
})
