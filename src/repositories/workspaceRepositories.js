import { createRepository, localScope } from './createRepository.js'
import { localStorageAdapter } from '../services/localStorageAdapter.js'
import { initialProjects, initialTasks, people, taskStages } from '../data/seed.js'
import { eventFields, groupEventsByDay, memberFields, projectFields, resolveTaskDueDate, taskFields, timeEntryFields, trackerView } from '../services/recordSchemas.js'
import { transitionTimer } from '../utils/timer.js'
import { parseCSV } from '../services/csv.js'
import { taskInput as validateTask } from '../services/tasks.js'
import { eventInput } from '../services/calendar.js'
import { assignedMemberIds, completionFields, memberInput } from '../services/team.js'

const calendarSeed = {
  '2026-9-8': [{ label: 'Payments API v2', color: 'sage' }],
  '2026-9-12': [{ label: 'Mobile onboarding', color: 'blue' }],
  '2026-9-15': [{ label: 'Design system audit', color: 'peach' }],
  '2026-9-19': [{ label: 'Sprint planning', color: 'lilac' }],
  '2026-9-22': [{ label: 'Halcyon Labs check-in', color: 'yellow' }],
  '2026-9-27': [{ label: 'Product review', color: 'blue' }],
}
const notificationSeed = [
  { id: 1, title: 'Priya moved a task to In review', detail: 'Design login & sign-up screens · 12 min ago', read: false, initials: 'PR' },
  { id: 2, title: 'New comment on Payments API v2', detail: 'Hana: “The retry flow is ready for a look.” · 1 hr ago', read: false, initials: 'HK' },
  { id: 3, title: 'Your weekly summary is ready', detail: 'A look back at the things your team shipped. · 3 hrs ago', read: false, initials: 'FL' },
]

// New authenticated workspaces will be constructed with their own scope and adapter.
// Only the pre-auth local workspace imports legacy storage and demo seeds.
export function createWorkspaceRepositories(scope = localScope, adapter = localStorageAdapter) {
  scope = Object.freeze({ ...scope })
  const local = scope.ownerId === localScope.ownerId && scope.workspaceId === localScope.workspaceId
  const repository = (collection, legacyKey, seed, migrate) => createRepository({ collection, scope, adapter,
    legacyKey: local ? legacyKey : undefined, seed: local ? seed : [], migrate })
  const tasks = repository('tasks', 'fernly-tasks', initialTasks, taskFields)
  const projects = repository('projects', 'fernly-projects', initialProjects, projectFields)
  const events = repository('events', 'fernly-events', calendarSeed, eventFields)
  const timeEntries = repository('time-entries', 'fernly-tracker-v1', [], timeEntryFields)
  const team = repository('team', 'fernly-team', people, memberFields)
  const notifications = repository('notifications', 'fernly-notifications', notificationSeed)
  const taskInput = (input) => {
    const title = String(input.title || '').trim()
    if (!title) throw new Error('A task name is required.')
    return { ...validateTask({ ...input, title, priority: input.priority || 'Medium', status: input.status || 'To do',
      dueDate: input.dueDate === undefined ? resolveTaskDueDate(input.due || 'In 3 days') : input.dueDate }),
      assignees: input.assignees || (local ? ['NC'] : []), assigneeIds: input.assigneeIds || [], comments: 0 }
  }
  tasks.saveTask = async (input, id) => {
    const fields = taskInput(input)
    await Promise.all([projects.load(), tasks.load(), team.load()])
    if (fields.projectId && !projects.getSnapshot().data.some((project) => project.id === fields.projectId)) throw new Error('Choose a project in this workspace.')
    const previous = tasks.getSnapshot().data.find((task) => task.id === id)
    const assignment = input.assigneeIds === undefined ? {} : assignmentFields(input.assigneeIds)
    if (id) { const { assignees: _assignees, assigneeIds: _assigneeIds, comments: _comments, ...editable } = fields; return tasks.update(id, { ...editable, ...assignment, ...completionFields(previous, fields.status) }) }
    return tasks.create({ ...fields, ...assignment, ...completionFields(null, fields.status) })
  }
  tasks.createTask = (input) => tasks.saveTask(input)
  const assignmentFields = (ids) => {
    if (!Array.isArray(ids)) throw new Error('Task assignees must be a list of workspace member IDs.')
    const unique = [...new Set(ids)]
    const members = team.getSnapshot().data
    if (unique.some((id) => !members.some((member) => member.id === id))) throw new Error('Choose team members in this workspace.')
    return { assigneeIds: unique, assignees: unique.map((id) => members.find((member) => member.id === id).initials) }
  }
  tasks.assign = async (id, ids) => { await team.load(); return tasks.update(id, assignmentFields(ids)) }
  tasks.addSubtask = (id, title) => tasks.transact((records) => {
    if (!String(title).trim()) throw new Error('A subtask name is required.')
    if (!records.some((item) => item.id === id)) throw new Error('Task not found.')
    return records.map((item) => item.id === id ? { ...item, updatedAt: Date.now(), subtasks: [...item.subtasks, { id: crypto.randomUUID(), title: title.trim(), completed: false }] } : item)
  })
  tasks.changeSubtask = (id, subtaskId, completed) => tasks.transact((records) => records.map((item) => item.id === id ? { ...item, updatedAt: Date.now(),
    subtasks: completed === null ? item.subtasks.filter((sub) => sub.id !== subtaskId) : item.subtasks.map((sub) => sub.id === subtaskId ? { ...sub, completed } : sub) } : item))
  tasks.reorder = (id, status, beforeId) => tasks.transact((records) => {
    if (!taskStages.includes(status)) throw new Error('Invalid task status.')
    const active = records.find((item) => item.id === id)
    if (!active) throw new Error('Task not found.')
    const others = records.filter((item) => item.id !== id).sort((a, b) => a.position - b.position)
    const index = beforeId ? others.findIndex((item) => item.id === beforeId) : -1
    const target = records.find((item) => item.id === beforeId)
    const after = target?.status === active.status && active.position < target.position
    others.splice(index < 0 ? others.length : index + (after ? 1 : 0), 0, { ...active, ...completionFields(active, status), updatedAt: Date.now() })
    return others.map((item, position) => ({ ...item, position }))
  })
  tasks.move = (id, status) => {
    if (!taskStages.includes(status)) return Promise.reject(new Error('Invalid task status.'))
    return tasks.transact((records) => {
      if (!records.some((task) => task.id === id)) throw new Error('Task not found.')
      return records.map((task) => task.id === id ? { ...task, ...completionFields(task, status), updatedAt: Date.now() } : task)
    })
  }
  projects.save = (fields, id) => {
    const name = String(fields.name || '').trim()
    if (!name) return Promise.reject(new Error('A project name is required.'))
    const input = { name, description: fields.description || '', status: fields.status || 'Pending', deadline: fields.deadline || '',
      initials: fields.initials || 'NC', color: fields.color || 'sage' }
    return id ? projects.update(id, input) : projects.create(input)
  }
  events.saveEvent = async (input, id) => {
    const fields = eventInput(input)
    await projects.load()
    if (fields.projectId && !projects.getSnapshot().data.some((project) => project.id === fields.projectId)) throw new Error('Choose a project in this workspace.')
    return id ? events.update(id, fields) : events.create(fields)
  }
  events.createEvent = (input) => events.saveEvent(input)
  events.groupByDay = groupEventsByDay
  timeEntries.view = trackerView
  timeEntries.act = (action, now, project) => timeEntries.transact((records) => {
    const next = transitionTimer(trackerView(records), action, now, project)
    return [...next.sessions, ...(next.active ? [next.active] : [])].map((entry) => {
      const previous = records.find((record) => record.id === entry.id)
      return { ...entry, createdAt: previous?.createdAt ?? entry.startedAt, updatedAt: entry === previous ? previous.updatedAt : now }
    })
  })
  notifications.markRead = (id) => notifications.update(id, { read: true })
  notifications.markAllRead = () => notifications.transact((records) => records.map((record) => ({ ...record, read: true, updatedAt: Date.now() })))
  team.saveMember = async (input, id) => {
    const fields = memberInput(input)
    await team.load()
    if (team.getSnapshot().data.some((member) => member.id !== id && member.email?.toLowerCase() === fields.email)) throw new Error('A team member with this email already exists.')
    const previous = team.getSnapshot().data.find((member) => member.id === id)
    if (!adapter.remote && previous && previous.initials !== fields.initials) {
      const members = team.getSnapshot().data
      await tasks.transact((records) => records.map((task) => {
        const ids = assignedMemberIds(task, members)
        if (!ids.includes(id)) return task
        const unresolved = (task.assignees || []).filter((initials) => !members.some((member) => member.initials === initials))
        return { ...task, assigneeIds: ids, assignees: [...ids.map((memberId) => memberId === id ? fields.initials : members.find((member) => member.id === memberId).initials), ...unresolved], updatedAt: Date.now() }
      }))
    }
    return id ? team.update(id, fields) : team.create(fields)
  }
  team.addMember = (input) => team.saveMember(input)
  team.removeMember = async (id) => {
    if (adapter.remote) return team.remove(id)
    await team.load()
    const members = team.getSnapshot().data
    const removed = members.find((member) => member.id === id)
    if (!removed) throw new Error('Member not found.')
    // Unassign before removal. A failed write keeps the member available for retry.
    await tasks.transact((records) => records.map((task) => {
      if (!assignedMemberIds(task, members).includes(id)) return task
      const assigneeIds = assignedMemberIds(task, members).filter((memberId) => memberId !== id)
      const unresolved = (task.assignees || []).filter((initials) => !members.some((member) => member.initials === initials))
      return { ...task, assigneeIds, assignees: [...assigneeIds.map((memberId) => members.find((member) => member.id === memberId).initials), ...unresolved], updatedAt: Date.now() }
    }))
    await team.remove(id)
  }
  const values = new Map()
  const valueRepository = (legacyKey, fallback, migrate = (value) => value) => {
    if (values.has(legacyKey)) return values.get(legacyKey)
    const collection = legacyKey.replace(/^fernly-/, '')
    const repo = createRepository({ collection, scope, adapter, legacyKey: local ? legacyKey : undefined,
      seed: fallback, migrate: (value) => Array.isArray(value) && value[0]?.id ? value : [{ id: local ? `${collection}:value` : crypto.randomUUID(), value: migrate(Array.isArray(value) && !value.length ? fallback : value) }] })
    repo.setValue = (next) => repo.transact((records) => records.map((record) => ({ ...record,
      value: typeof next === 'function' ? next(record.value) : next, updatedAt: Date.now() })))
    values.set(legacyKey, repo)
    return repo
  }
  const importRows = async (rows) => {
    const isTasks = rows.some((row) => row.stage || row.task || (!row.project && !row.deadline && !row.description && taskStages.some((stage) => stage.toLowerCase() === (row.status || '').toLowerCase())))
    if (isTasks) return tasks.createMany(rows.map((row) => taskInput({ ...row, title: row.title || row.name || row.task,
      team: row.team || row.department, due: row.due || row.duedate,
      status: taskStages.find((stage) => stage.toLowerCase() === (row.status || row.stage || '').toLowerCase()) || 'To do',
      priority: ['High', 'Medium', 'Low', 'Urgent'].find((level) => level.toLowerCase() === (row.priority || '').toLowerCase()) || 'Medium' })))
    const inputs = rows.map((row) => {
      const name = row.title || row.name || row.project
      if (!name?.trim()) throw new Error('Every project row needs a title or name column.')
      return { name: name.trim(), description: row.description || '', status: row.status, deadline: row.deadline,
        due: row.due || row.duedate, initials: 'NC', color: 'sage' }
    })
    return projects.createMany(inputs)
  }
  return { tasks, projects, events, timeEntries, team, notifications, valueRepository, importRows, importCsv: (contents) => importRows(parseCSV(contents)) }
}

export let workspaceRepositories = createWorkspaceRepositories()
let workspaceAdapter
export function configureWorkspace(scope, adapter) {
  workspaceAdapter?.dispose?.()
  workspaceAdapter = adapter
  workspaceRepositories = createWorkspaceRepositories(scope, adapter)
}
export function refreshWorkspace() { return workspaceAdapter?.refresh?.() }
export function closeWorkspace() { workspaceAdapter?.dispose?.(); workspaceAdapter = undefined }
