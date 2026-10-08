import { Temporal } from '@js-temporal/polyfill'

export const defaultTimeZone = 'Asia/Kolkata'
export const calendarKinds = { meeting: 'Meeting', task: 'Task deadline', project: 'Project deadline' }
export const dateInZone = (now = Date.now(), zone = defaultTimeZone) => Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(zone).toPlainDate().toString()
export const shiftDate = (date, amount) => Temporal.PlainDate.from(date).add(amount).toString()
export const startOfDate = (date, zone = defaultTimeZone) => Temporal.PlainDate.from(date).toZonedDateTime(zone).epochMilliseconds
export function calendarDates(anchor, view) {
  const date = Temporal.PlainDate.from(anchor)
  if (view === 'Day') return [anchor]
  const first = view === 'Month' ? date.with({ day: 1 }) : date
  const start = first.subtract({ days: first.dayOfWeek % 7 })
  return Array.from({ length: view === 'Month' ? 42 : 7 }, (_, index) => start.add({ days: index }).toString())
}
export function wallTime(date, time, zone, disambiguation = 'reject') {
  try {
    const plain = Temporal.PlainDateTime.from(`${date}T${time}`, { overflow: 'reject' })
    const zoned = plain.toZonedDateTime(zone, { disambiguation })
    if (!zoned.toPlainDateTime().equals(plain)) throw new Error('Skipped clock time')
    return zoned.epochMilliseconds
  } catch { throw new Error('Invalid timezone or local time. Daylight-saving gaps cannot be scheduled; for a repeated hour, choose its earlier or later occurrence.') }
}
export function eventInput(input) {
  const title = String(input.title || '').trim()
  if (!title) throw new Error('An event name is required.')
  const date = String(input.date || '')
  try { if (Temporal.PlainDate.from(date).toString() !== date) throw new Error() } catch { throw new Error('A valid event date is required.') }
  const time = input.time || ''
  const timeZone = input.timeZone || defaultTimeZone
  try { dateInZone(Date.now(), timeZone) } catch { throw new Error('Choose a valid IANA timezone.') }
  const durationMinutes = time ? Number(input.durationMinutes ?? 60) : 0
  if (time && (!/^\d{2}:\d{2}$/.test(time) || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 10080)) throw new Error('Choose a valid time and duration between 1 and 10080 minutes.')
  const dstChoice = ['earlier', 'later'].includes(input.dstChoice) ? input.dstChoice : 'reject'
  const startsAt = time ? wallTime(date, time, timeZone, dstChoice) : null
  return { title, date, time, timeZone, durationMinutes, startsAt, endsAt: startsAt === null ? null : startsAt + durationMinutes * 60000,
    dstChoice, description: String(input.description || ''), color: input.color || 'sage', projectId: input.projectId || null }
}
export function calendarEntries(events, tasks, projects, zone = defaultTimeZone) {
  const meetings = events.map((event) => {
    let startsAt = event.startsAt ?? null
    if (startsAt === null && event.time) { try { startsAt = wallTime(event.date, event.time, event.timeZone || defaultTimeZone, event.dstChoice === 'reject' ? 'reject' : event.dstChoice || 'earlier') } catch { /* Preserve legacy data as a date-only entry. */ } }
    const endsAt = startsAt === null ? null : event.endsAt ?? startsAt + (event.durationMinutes || 60) * 60000
    const date = startsAt === null ? event.date : dateInZone(startsAt, zone)
    return { ...event, id: `meeting:${event.id}`, recordId: event.id, kind: 'meeting', date, startsAt, endsAt,
      endDate: endsAt === null ? date : dateInZone(endsAt - 1, zone), displayTime: startsAt === null ? 'All day' : new Intl.DateTimeFormat('en', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(startsAt) }
  })
  return [...meetings,
    ...tasks.filter((task) => task.dueDate).map((task) => ({ id: `task:${task.id}`, recordId: task.id, kind: 'task', title: task.title, date: task.dueDate, endDate: task.dueDate, projectId: task.projectId, completed: task.status === 'Done', displayTime: 'Deadline' })),
    ...projects.filter((project) => project.deadline).map((project) => ({ id: `project:${project.id}`, recordId: project.id, kind: 'project', title: project.name, date: project.deadline, endDate: project.deadline, projectId: project.id, completed: project.status === 'Completed', displayTime: 'Deadline' }))]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startsAt ?? 0) - (b.startsAt ?? 0) || a.title.localeCompare(b.title))
}
export const entriesOnDate = (entries, date) => entries.filter((entry) => entry.date <= date && entry.endDate >= date)
export const filterCalendar = (entries, { search = '', kind = '', projectId = '' } = {}) => entries.filter((entry) => (!kind || entry.kind === kind) && (!projectId || entry.projectId === projectId) && `${entry.title} ${entry.description || ''}`.toLowerCase().includes(search.toLowerCase()))
export function upcomingEntries(entries, now = Date.now(), zone = defaultTimeZone) {
  const today = dateInZone(now, zone)
  return entries.filter((entry) => !entry.completed && (entry.endsAt !== null && entry.endsAt !== undefined ? entry.endsAt > now : entry.date >= today))
}
