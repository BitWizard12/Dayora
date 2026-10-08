import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceRepositories } from '../src/repositories/workspaceRepositories.js'
import { localScope } from '../src/repositories/createRepository.js'
import { calendarDates, calendarEntries, entriesOnDate, eventInput, filterCalendar, upcomingEntries, startOfDate } from '../src/services/calendar.js'
import { assignedMemberIds, teamWorkload } from '../src/services/team.js'
import { productivityAnalytics, savedTrackedTime } from '../src/services/analytics.js'
import { dashboardInsights } from '../src/services/dashboardSelectors.js'
import { analyticsCsv, encodeCsv } from '../src/services/export.js'
import { parseCSV } from '../src/services/csv.js'
const memory = (initial = {}) => { const data = new Map(Object.entries(initial)); return { data, read: (key) => structuredClone(data.get(key)), write: (key, value) => data.set(key, structuredClone(value)) } }
const scope = { ownerId: 'phase4-user', workspaceId: 'phase4' }

test('event CRUD persists timezone instants and preserves ownership and IDs', async () => {
  const store = memory(), repos = createWorkspaceRepositories(scope, store)
  const event = await repos.events.saveEvent({ title: 'Planning', date: '2026-10-06', time: '23:30', timeZone: 'America/New_York', durationMinutes: 90 })
  assert.equal(event.startsAt, Date.parse('2026-10-07T03:30:00Z'))
  assert.equal(event.endsAt - event.startsAt, 5400000)
  const updated = await repos.events.saveEvent({ ...event, title: 'Updated planning', durationMinutes: 120 }, event.id)
  assert.equal(updated.ownerId, scope.ownerId); assert.equal(updated.createdAt, event.createdAt)
  const restored = createWorkspaceRepositories(scope, store)
  assert.deepEqual(await restored.events.load(), [updated])
  await restored.events.remove(event.id); assert.deepEqual(restored.events.getSnapshot().data, [])
  await assert.rejects(repos.events.saveEvent({ title: '', date: '2026-10-06' }), /name/)
  await assert.rejects(repos.events.saveEvent({ title: 'Bad', date: '2026-02-30' }), /date/)
  await assert.rejects(repos.events.saveEvent({ title: 'Bad', date: '2026-10-06', projectId: 'foreign' }), /workspace/)
})
test('timezone conversion handles midnight, all-day dates, gaps and repeated clock hours', () => {
  const input = { title: 'DST meeting', date: '2026-11-01', time: '01:30', timeZone: 'America/New_York', durationMinutes: 60 }
  assert.throws(() => eventInput(input), /repeated hour/)
  const earlier = eventInput({ ...input, dstChoice: 'earlier' }), later = eventInput({ ...input, dstChoice: 'later' })
  assert.equal(later.startsAt - earlier.startsAt, 3600000)
  for (const dstChoice of ['reject', 'earlier', 'later']) assert.throws(() => eventInput({ ...input, date: '2026-03-08', time: '02:30', dstChoice }), /gaps/)
  assert.throws(() => eventInput({ ...input, timeZone: 'Mars/City' }), /timezone/)
  const crossDay = { id: 'cross-day', ...eventInput({ title: 'Late meeting', date: '2026-10-06', time: '23:30', timeZone: 'America/New_York', durationMinutes: 120 }) }
  assert.equal(calendarEntries([crossDay], [], [], 'Asia/Kolkata')[0].date, '2026-10-07')
  const utc = calendarEntries([crossDay], [], [], 'UTC')[0]
  assert.equal(utc.displayTime, '03:30')
  const allDay = { id: 'all-day', ...eventInput({ title: 'All day', date: '2026-10-06', timeZone: 'America/New_York' }) }
  assert.equal(calendarEntries([allDay], [], [], 'Asia/Tokyo')[0].date, '2026-10-06')
  const spanning = calendarEntries([{ id: 'span', ...eventInput({ title: 'Night', date: '2026-10-06', time: '23:30', timeZone: 'UTC', durationMinutes: 120 }) }], [], [], 'UTC')
  assert.equal(entriesOnDate(spanning, '2026-10-07').length, 1)
})
test('calendar deadlines are live projections without duplicate persistent events', async () => {
  const repos = createWorkspaceRepositories(scope, memory())
  const project = await repos.projects.save({ name: 'Delivery', deadline: '2026-10-08' })
  const task = await repos.tasks.saveTask({ title: 'QA', projectId: project.id, dueDate: '2026-10-07' })
  await repos.events.load()
  let entries = calendarEntries(repos.events.getSnapshot().data, repos.tasks.getSnapshot().data, repos.projects.getSnapshot().data)
  assert.equal(entries.length, 2); assert.equal(repos.events.getSnapshot().data.length, 0)
  await repos.tasks.saveTask({ ...task, dueDate: '2026-10-09' }, task.id)
  await repos.projects.save({ ...project, deadline: '2026-10-10' }, project.id)
  entries = calendarEntries([], repos.tasks.getSnapshot().data, repos.projects.getSnapshot().data)
  assert.equal(entries.find((entry) => entry.kind === 'task').date, '2026-10-09')
  assert.equal(entries.find((entry) => entry.kind === 'project').date, '2026-10-10')
  assert.equal(filterCalendar(entries, { kind: 'task', search: 'qa', projectId: project.id }).length, 1)
  assert.equal(upcomingEntries(entries, Date.parse('2026-10-11T00:00Z')).length, 0)
  assert.equal(calendarDates('2026-02-28', 'Month').length, 42)
  assert.deepEqual(calendarDates('2026-10-06', 'Day'), ['2026-10-06'])
  assert.equal(calendarDates('2026-10-06', 'Week')[0], '2026-10-04')
})
test('member CRUD and assignment relationships survive renaming, removal and reload', async () => {
  const store = memory(), repos = createWorkspaceRepositories(scope, store)
  const member = await repos.team.saveMember({ name: 'Avery Patel', email: 'avery@example.com', role: 'Designer', department: 'Design', photo: 'data:image/png;base64,AAAA' })
  const co = await repos.team.saveMember({ name: 'Jordan Lee', email: 'jordan@example.com', role: 'Engineer', department: 'Engineering' })
  const task = await repos.tasks.saveTask({ title: 'Ship', assigneeIds: [member.id, co.id] })
  await assert.rejects(repos.tasks.assign(task.id, ['foreign']), /workspace/)
  await assert.rejects(repos.team.saveMember({ ...member, name: 'Duplicate' }), /already exists/)
  await repos.team.saveMember({ ...member, name: 'Avery Shah' }, member.id)
  assert.deepEqual(repos.tasks.getSnapshot().data[0].assigneeIds, [member.id, co.id])
  assert.ok(repos.tasks.getSnapshot().data[0].assignees.includes('AS'))
  await repos.tasks.move(task.id, 'Done')
  assert.equal(teamWorkload(repos.tasks.getSnapshot().data, repos.team.getSnapshot().data)[0].completed, 1)
  await repos.team.removeMember(member.id)
  assert.deepEqual(repos.tasks.getSnapshot().data[0].assigneeIds, [co.id])
  assert.equal(repos.tasks.getSnapshot().data[0].status, 'Done')
  const restored = createWorkspaceRepositories(scope, store)
  assert.equal((await restored.team.load()).length, 1)
  assert.equal((await restored.tasks.load())[0].id, task.id)
  assert.equal(restored.team.getSnapshot().data[0].ownerId, scope.ownerId)
})
test('legacy assignments resolve only unique initials and become stable IDs on rename', async () => {
  const store = memory({ 'fernly-team': [{ id: 'member', name: 'Avery Patel', email: 'avery@example.com', role: 'Designer', initials: 'AP' }],
    'fernly-tasks': [{ id: 'task', title: 'Legacy', status: 'Done', assignees: ['AP', 'XX'] }] })
  const repos = createWorkspaceRepositories(localScope, store)
  await Promise.all([repos.team.load(), repos.tasks.load()])
  const member = repos.team.getSnapshot().data[0]
  await repos.team.saveMember({ ...member, name: 'Avery Shah' }, member.id)
  const task = repos.tasks.getSnapshot().data[0]
  assert.deepEqual(task.assigneeIds, [member.id]); assert.deepEqual(task.assignees, ['AS', 'XX']); assert.equal(task.completedAt, null)
  assert.deepEqual(assignedMemberIds({ assignees: ['AP'] }, [{ id: '1', initials: 'AP' }, { id: '2', initials: 'AP' }]), [])
})
test('completion dates are recorded on transitions and legacy dates are not invented', async () => {
  const repos = createWorkspaceRepositories(scope, memory())
  const task = await repos.tasks.createTask({ title: 'Dated task' })
  await repos.tasks.move(task.id, 'Done')
  const done = repos.tasks.getSnapshot().data[0]
  assert.equal(typeof done.completedAt, 'number')
  await repos.tasks.saveTask({ ...done, description: 'Edited' }, task.id)
  assert.equal(repos.tasks.getSnapshot().data[0].completedAt, done.completedAt)
  await repos.tasks.reorder(task.id, 'In progress')
  assert.equal(repos.tasks.getSnapshot().data[0].completedAt, null)
  const legacy = await repos.tasks.create({ title: 'Historical', status: 'Done' })
  await repos.tasks.move(legacy.id, 'Done')
  assert.equal(repos.tasks.getSnapshot().data.find((item) => item.id === legacy.id).completedAt, null)
})
test('analytics calculate date buckets, priorities, project performance, saved time and overdue work', () => {
  const now = Date.parse('2026-10-06T12:00:00Z'), start = startOfDate('2026-09-30'), completedAt = Date.parse('2026-10-06T10:00:00Z')
  const tasks = [{ id: 'done', title: 'Complete', status: 'Done', priority: 'High', projectId: 'p', assigneeIds: ['m'], createdAt: start, completedAt, dueDate: '2026-10-06' },
    { id: 'pending', title: 'Late', status: 'To do', priority: 'Urgent', projectId: 'p', assigneeIds: ['m'], dueDate: '2026-10-04', createdAt: null },
    { id: 'legacy', status: 'Done', priority: 'Low', completedAt: null }, { id: 'old', status: 'Done', priority: 'Medium', completedAt: start - 1 }]
  const projects = [{ id: 'p', name: 'Real project' }], team = [{ id: 'm', name: 'Member', initials: 'MM' }]
  const timeEntries = [{ id: 'saved', projectId: 'p', endedAt: start + 1800000, segments: [{ start: start - 1800000, end: start + 1800000 }], duration: 3600000 },
    { id: 'active', projectId: 'p', endedAt: null, segments: [{ start, end: now }] }]
  const report = productivityAnalytics({ tasks, projects, team, timeEntries }, { days: 7, now })
  assert.equal(report.completedInPeriod, 1); assert.equal(report.completed, 3); assert.equal(report.pending, 1)
  assert.equal(report.overdue, 1); assert.equal(report.unknownCompletionDates, 1); assert.equal(report.onTimeRate, 100)
  assert.equal(report.daily.at(-1).completed, 1); assert.equal(report.daily[0].created, 1)
  assert.equal(report.weekly[0].completed, 1); assert.equal(report.monthly.reduce((sum, row) => sum + row.completed, 0), 1)
  assert.equal(report.trackedMilliseconds, 1800000); assert.equal(savedTrackedTime(timeEntries), 3600000)
  assert.equal(report.projects[0].progress, 50); assert.equal(report.workload[0].total, 2)
  assert.equal(report.priorities.reduce((sum, row) => sum + row.count, 0), 4)
  assert.equal(productivityAnalytics({ tasks, projects, team, timeEntries }, { days: 7, now, projectId: 'p' }).total, 2)
  const insights = dashboardInsights({ events: [], tasks, projects, team, timeEntries }, now)
  assert.equal(insights.projects[0].progress, 50); assert.equal(insights.savedTime, 3600000)
  assert.equal(insights.workload[0].completed, 1)
})
test('CSV export contains actual report values, quotes content and neutralizes formulas', () => {
  const report = productivityAnalytics({ tasks: [], projects: [{ id: 'p', name: '=HYPERLINK("evil")\nProject' }], team: [], timeEntries: [] }, { days: 7, now: Date.parse('2026-10-06T12:00Z') })
  const rows = parseCSV(analyticsCsv(report))
  assert.equal(rows.find((row) => row.type === 'Summary' && row.name === 'Tasks').total, '0')
  assert.equal(rows.filter((row) => row.type === 'daily').length, 7)
  assert.equal(rows.find((row) => row.type === 'Project').name, '\'=HYPERLINK("evil")\nProject')
  assert.equal(encodeCsv([['+SUM(1,2)', 'a"b', 'line\nbreak']]), '"\'+SUM(1,2)","a""b","line\nbreak"\r\n')
})
