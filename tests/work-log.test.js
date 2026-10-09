import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceRepositories } from '../src/repositories/workspaceRepositories.js'
import { focusedToday, groupWorkLog } from '../src/services/workLog.js'
import { savedTrackedTime } from '../src/services/analytics.js'

const memory = () => { const data = new Map(); return { async read(key) { return data.get(key) }, async write(key, value) { data.set(key, structuredClone(value)) } } }
test('timer notes survive pause, stop, edits and reload; saved sessions remain usable by analytics', async () => {
  const adapter = memory(), scope = { ownerId: 'alice', workspaceId: 'personal' }, repos = createWorkspaceRepositories(scope, adapter)
  const start = Date.parse('2026-10-09T09:30:00+05:30')
  const project = await repos.projects.save({ name: 'Dayora' })
  const task = await repos.tasks.createTask({ title: 'Deploy', projectId: project.id })
  await repos.timeEntries.act('start', start, project, { title: 'Deployment', note: 'Configured Firebase', taskId: task.id })
  const active = repos.timeEntries.getSnapshot().data[0]
  await repos.timeEntries.saveDetails(active.id, { title: 'Deployment', note: 'Tested verification', taskId: task.id })
  await repos.timeEntries.act('pause', start + 60000)
  assert.equal(repos.timeEntries.getSnapshot().data[0].note, 'Tested verification')
  await repos.timeEntries.act('resume', start + 120000)
  await repos.timeEntries.act('stop', start + 180000)
  assert.equal(savedTrackedTime(repos.timeEntries.getSnapshot().data), 120000)
  await repos.timeEntries.saveDetails(active.id, { title: 'Deployment complete', note: 'Ready to ship', taskId: task.id })
  const reloaded = createWorkspaceRepositories(scope, adapter)
  const rows = await reloaded.timeEntries.load()
  assert.equal(rows[0].note, 'Ready to ship'); assert.equal(rows[0].taskId, task.id); assert.equal(rows[0].projectId, project.id)
  assert.equal(groupWorkLog(rows)[0].date, '2026-10-09')
  assert.equal(focusedToday(rows, start + 180000), 120000)
})

test('daily note writes serialize, use UUIDs and remain isolated between workspaces', async () => {
  const adapter = memory(), scope = { ownerId: 'alice', workspaceId: 'personal' }, repo = createWorkspaceRepositories(scope, adapter)
  await Promise.all([repo.dailyNotes.save('2026-10-09', 'First draft'), repo.dailyNotes.save('2026-10-09', 'Final thoughts')])
  const saved = repo.dailyNotes.getSnapshot().data
  assert.equal(saved.length, 1); assert.match(saved[0].id, /^[0-9a-f-]{36}$/); assert.equal(saved[0].note, 'Final thoughts')
  const restored = createWorkspaceRepositories(scope, adapter)
  assert.equal((await restored.dailyNotes.load())[0].note, 'Final thoughts')
  assert.deepEqual(await createWorkspaceRepositories({ ownerId: 'alice', workspaceId: 'team' }, adapter).dailyNotes.load(), [])
})

test('shared timer commands preserve other people’s sessions and edit only the current author', async () => {
  const adapter = memory(), owner = createWorkspaceRepositories({ ownerId: 'owner', workspaceId: 'team', actorId: 'owner' }, adapter)
  const member = createWorkspaceRepositories({ ownerId: 'owner', workspaceId: 'team', actorId: 'member' }, adapter)
  await owner.timeEntries.act('start', 1000, {}, { note: 'Owner focus' })
  await member.timeEntries.act('start', 2000, {}, { note: 'Member focus' })
  const rows = member.timeEntries.getSnapshot().data
  assert.equal(rows.length, 2)
  assert.equal(member.timeEntries.view(rows).active.authorId, 'member')
  await assert.rejects(member.timeEntries.saveDetails(rows.find((row) => row.authorId === 'owner').id, { note: 'Tampered' }), /only your own/)
  await member.timeEntries.act('stop', 5000)
  assert.equal(member.timeEntries.getSnapshot().data.find((row) => row.authorId === 'owner').endedAt, null)
})
