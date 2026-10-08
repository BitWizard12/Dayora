import test from 'node:test'
import assert from 'node:assert/strict'
import { elapsed, emptyTracker, formatDuration, trackedToday, transitionTimer } from '../src/utils/timer.js'
import { normalizeProjects, projectMetrics } from '../src/utils/projects.js'

test('timestamps retain accuracy across delayed ticks and pauses', () => {
  let state = transitionTimer(emptyTracker, 'start', 1000, { sessionId: 'session' })
  assert.equal(elapsed(state.active, 61000), 60000)
  state = transitionTimer(state, 'pause', 61000)
  assert.equal(elapsed(state.active, 300000), 60000)
  state = transitionTimer(state, 'resume', 300000)
  state = transitionTimer(state, 'stop', 310000)
  assert.equal(state.sessions[0].duration, 70000)
  assert.equal(state.active, null)
  assert.equal(transitionTimer(state, 'stop', 320000).sessions.length, 1)
})

test('reload serialization preserves a running session without per-tick writes', () => {
  const saved = JSON.stringify(transitionTimer(emptyTracker, 'start', 0, { sessionId: 'reload' }))
  const restored = JSON.parse(saved)
  assert.equal(elapsed(restored.active, 123456), 123456)
  assert.equal(formatDuration(elapsed(restored.active, 123456)), '00:02:03')
})

test('today total clips sessions across midnight in India and excludes pause gaps', () => {
  const beforeMidnight = Date.parse('2026-10-05T23:59:50+05:30')
  let state = transitionTimer(emptyTracker, 'start', beforeMidnight, { sessionId: 'overnight' })
  state = transitionTimer(state, 'pause', beforeMidnight + 20000)
  state = transitionTimer(state, 'resume', beforeMidnight + 50000)
  state = transitionTimer(state, 'stop', beforeMidnight + 60000)
  assert.equal(trackedToday(state, beforeMidnight + 65000), 20000)
  assert.equal(state.sessions[0].duration, 30000)
  assert.equal(trackedToday(state, Date.parse('2026-10-07T00:00:00+05:30')), 0)
})

test('today total includes active and paused work', () => {
  const now = Date.parse('2026-10-06T12:00:00+05:30')
  let state = transitionTimer(emptyTracker, 'start', now, { sessionId: 'active' })
  assert.equal(trackedToday(state, now + 10000), 10000)
  state = transitionTimer(state, 'pause', now + 10000)
  assert.equal(trackedToday(state, now + 90000), 10000)
})

test('legacy project migration retains data, empty lists, IDs, and honest counts', () => {
  const projects = normalizeProjects([{ name: 'Existing', due: 'Oct 8, 2026', color: 'blue' }])
  assert.equal(projects[0].deadline, '2026-10-08')
  assert.equal(projects[0].color, 'blue')
  assert.deepEqual(normalizeProjects(projects), projects)
  assert.deepEqual(projectMetrics([...projects, { status: 'Completed' }, { status: 'Pending' }]), { total: 3, completed: 1, pending: 1, running: 1 })
  assert.deepEqual(normalizeProjects([]), [])
})
