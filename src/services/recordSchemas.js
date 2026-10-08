import { normalizeProjects } from '../utils/projects.js'
import { inferDepartment } from './team.js'

export const projectFields = (records) => normalizeProjects(records).map((record) => ({ ...record, description: record.description || '' }))

export function taskFields(records) {
  return records.map((record, index) => ({ ...record, description: record.description || '', position: record.position ?? index, completedAt: record.completedAt ?? null,
    subtasks: (record.subtasks || []).map((item) => ({ ...item, id: item.id || crypto.randomUUID(), completed: Boolean(item.completed) })),
    projectId: record.projectId ?? null, dueDate: record.dueDate ?? null,
    assigneeIds: record.assigneeIds || [], assignees: record.assignees || [], comments: record.comments || 0 }))
}

export function eventFields(source) {
  const records = Array.isArray(source) ? source : Object.entries(source).flatMap(([key, events]) => {
    const [year, month, day] = key.split('-').map(Number)
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.map((event) => ({ ...event, date }))
  })
  return records.map((record) => ({ ...record, title: record.title || record.label, time: record.time || '', description: record.description || '', startsAt: record.startsAt ?? null, endsAt: record.endsAt ?? null,
    timeZone: record.timeZone || 'Asia/Kolkata', projectId: record.projectId ?? null }))
}

export const memberFields = (records) => records.map((record) => ({ ...record, department: record.department || inferDepartment(record.role), photo: record.photo || '' }))

export function groupEventsByDay(records) {
  return records.reduce((days, event) => {
    const [year, month, day] = event.date.split('-').map(Number)
    const key = `${year}-${month - 1}-${day}`
    ;(days[key] ||= []).push({ ...event, label: event.title })
    return days
  }, {})
}

export function timeEntryFields(source) {
  const records = Array.isArray(source) ? source : [...(source.sessions || []), ...(source.active ? [{ ...source.active, endedAt: null }] : [])]
  return records.map((record) => ({ ...record, projectId: record.projectId ?? null, endedAt: record.endedAt ?? null,
    segments: record.segments || [], runningSince: record.runningSince ?? null }))
}

export function trackerView(records) {
  return { active: records.find((record) => record.endedAt === null) || null, sessions: records.filter((record) => record.endedAt !== null) }
}

export function resolveTaskDueDate(label, now = Date.now()) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(label || '')) return label
  const offset = label === 'Today' ? 0 : label === 'Tomorrow' ? 1 : label === 'Yesterday' ? -1 : /^In (\d+) days$/.exec(label || '')?.[1]
  if (offset === undefined) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now + Number(offset) * 86400000)
  const value = (type) => parts.find((part) => part.type === type).value
  return `${value('year')}-${value('month')}-${value('day')}`
}
