import { elapsed, todayBounds } from '../utils/timer.js'

export const logDate = (timestamp) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(timestamp)
export function groupWorkLog(entries) {
  const groups = new Map()
  for (const entry of [...entries].sort((a, b) => b.startedAt - a.startedAt)) {
    const date = logDate(entry.startedAt)
    if (!groups.has(date)) groups.set(date, [])
    groups.get(date).push(entry)
  }
  return [...groups].map(([date, records]) => ({ date, records }))
}
export function focusedToday(entries, now) {
  const { start, end } = todayBounds(now)
  return entries.reduce((sum, entry) => {
    const segments = [...(entry.segments || []), ...(entry.runningSince != null ? [{ start: entry.runningSince, end: now }] : [])]
    return sum + segments.reduce((total, segment) => total + Math.max(0, Math.min(segment.end, end, now) - Math.max(segment.start, start)), 0)
  }, 0)
}
export const sessionDuration = (entry, now) => entry.endedAt === null ? elapsed(entry, now) : entry.duration ?? elapsed(entry, entry.endedAt)
