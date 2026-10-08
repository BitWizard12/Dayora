import { dateInZone, defaultTimeZone, shiftDate, startOfDate } from './calendar.js'
import { teamWorkload } from './team.js'
import { priorities } from './tasks.js'

export function savedTrackedTime(entries, start = -Infinity, end = Infinity) {
  return entries.filter((entry) => entry.endedAt !== null).reduce((sum, entry) => {
    if (entry.segments?.length) return sum + entry.segments.reduce((total, segment) => total + Math.max(0, Math.min(segment.end, end) - Math.max(segment.start, start)), 0)
    // Legacy entries without segments can only be attributed by their saved end timestamp.
    return sum + (entry.endedAt >= start && entry.endedAt < end ? Math.max(0, entry.duration || 0) : 0)
  }, 0)
}
export function projectPerformance(tasks, projects, entries = [], start, end) {
  return projects.map((project) => {
    const associated = tasks.filter((task) => task.projectId === project.id)
    const completed = associated.filter((task) => task.status === 'Done').length
    return { ...project, total: associated.length, completed, pending: associated.length - completed,
      progress: associated.length ? Math.round(completed / associated.length * 100) : 0,
      trackedMilliseconds: savedTrackedTime(entries.filter((entry) => entry.projectId === project.id), start, end) }
  })
}
export function productivityAnalytics({ tasks, projects, team, timeEntries }, { days = 30, projectId = '', timeZone = defaultTimeZone, now = Date.now() } = {}) {
  if (![7, 30, 90, 365].includes(Number(days))) throw new Error('Unsupported analytics period.')
  days = Number(days)
  const today = dateInZone(now, timeZone), firstDate = shiftDate(today, { days: 1 - days })
  const start = startOfDate(firstDate, timeZone), end = now + 1
  const selected = tasks.filter((task) => !projectId || task.projectId === projectId)
  const entries = timeEntries.filter((entry) => !projectId || entry.projectId === projectId)
  const completions = selected.filter((task) => task.status === 'Done' && typeof task.completedAt === 'number')
  const daily = Array.from({ length: days }, (_, index) => {
    const date = shiftDate(firstDate, { days: index }), lower = startOfDate(date, timeZone), upper = Math.min(startOfDate(shiftDate(date, { days: 1 }), timeZone), end)
    return { date, label: date.slice(5), created: selected.filter((task) => typeof task.createdAt === 'number' && task.createdAt >= lower && task.createdAt < upper).length,
      completed: completions.filter((task) => task.completedAt >= lower && task.completedAt < upper).length, trackedHours: savedTrackedTime(entries, lower, upper) / 3600000 }
  })
  const weekly = Array.from({ length: Math.ceil(days / 7) }, (_, index) => {
    const rows = daily.slice(index * 7, index * 7 + 7)
    return { date: rows[0].date, label: rows[0].label, completed: rows.reduce((sum, row) => sum + row.completed, 0), created: rows.reduce((sum, row) => sum + row.created, 0), trackedHours: rows.reduce((sum, row) => sum + row.trackedHours, 0) }
  })
  const monthly = Object.values(daily.reduce((months, row) => { const month = row.date.slice(0, 7); months[month] ||= { date: month, label: month, completed: 0, created: 0, trackedHours: 0 }; months[month].completed += row.completed; months[month].created += row.created; months[month].trackedHours += row.trackedHours; return months }, {}))
  const completed = selected.filter((task) => task.status === 'Done').length
  const completedInPeriod = daily.reduce((sum, row) => sum + row.completed, 0)
  const overdue = selected.filter((task) => task.status !== 'Done' && task.dueDate && task.dueDate < today)
  const deliveries = completions.filter((task) => task.dueDate && task.completedAt >= start && task.completedAt < end)
  const onTime = deliveries.filter((task) => dateInZone(task.completedAt, timeZone) <= task.dueDate).length
  return { days, timeZone, firstDate, today, daily, weekly, monthly, total: selected.length, completed, pending: selected.length - completed,
    completedInPeriod, unknownCompletionDates: selected.filter((task) => task.status === 'Done' && task.completedAt == null).length,
    overdue: overdue.length, overdueTasks: overdue, onTimeRate: deliveries.length ? Math.round(onTime / deliveries.length * 100) : null,
    trackedMilliseconds: savedTrackedTime(entries, start, end),
    priorities: priorities.map((priority) => ({ name: priority, count: selected.filter((task) => task.priority === priority).length })),
    breakdown: [{ name: 'Completed', count: completed }, { name: 'Pending', count: selected.length - completed }],
    projects: projectPerformance(selected, projects.filter((project) => !projectId || project.id === projectId), entries, start, end),
    workload: teamWorkload(selected, team) }
}
