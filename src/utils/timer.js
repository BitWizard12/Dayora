export const emptyTracker = { active: null, sessions: [] }
export const timeZone = 'Asia/Kolkata'

export function elapsed(active, now) {
  if (!active) return 0
  return active.segments.reduce((sum, segment) => sum + segment.end - segment.start, 0)
    + (active.runningSince === null ? 0 : Math.max(0, now - active.runningSince))
}

export function transitionTimer(state, action, now, project = {}) {
  const active = state.active
  if (action === 'start' && !active) return { ...state, active: {
    id: project.sessionId || globalThis.crypto.randomUUID(), projectId: project.id || null,
    label: project.name || 'Focus session', startedAt: now, runningSince: now, segments: [],
  } }
  if (!active) return state
  if (action === 'resume' && active.runningSince === null) return { ...state, active: { ...active, runningSince: now } }
  const segments = active.runningSince === null ? active.segments : [...active.segments, { start: active.runningSince, end: Math.max(active.runningSince, now) }]
  if (action === 'pause' && active.runningSince !== null) return { ...state, active: { ...active, segments, runningSince: null } }
  if (action === 'stop') return { active: null, sessions: [...state.sessions, { ...active, segments, runningSince: null, endedAt: now, duration: elapsed(active, now) }] }
  return state
}

export function todayBounds(now) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const value = (type) => parts.find((p) => p.type === type).value
  const start = Date.parse(`${value('year')}-${value('month')}-${value('day')}T00:00:00+05:30`)
  return { start, end: start + 86400000 }
}

export function trackedToday(state, now) {
  const { start, end } = todayBounds(now)
  const segments = state.sessions.flatMap((session) => session.segments)
  if (state.active) {
    segments.push(...state.active.segments)
    if (state.active.runningSince !== null) segments.push({ start: state.active.runningSince, end: now })
  }
  return segments.reduce((sum, segment) => sum + Math.max(0, Math.min(segment.end, end, now) - Math.max(segment.start, start)), 0)
}

export function formatDuration(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000)
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((n) => String(n).padStart(2, '0')).join(':')
}
