import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { collections, recordsRef, workspaceRef, auditRef } from './firebaseRepositories.js'
import { getFirebase } from './firebaseAdmin.js'
import { storePhoto, assertPhotoOwnership } from './media.js'
import { ApiError } from './errors.js'
import { taskInput } from '../src/services/tasks.js'
import { memberInput, completionFields, assignedMemberIds } from '../src/services/team.js'
import { eventInput } from '../src/services/calendar.js'
import { isDeepStrictEqual } from 'node:util'
import { resolveWorkspace, verifyWorkspaceAccess, teamRef } from './workspaceAccess.js'

const idSchema = z.string().min(1).max(150).regex(/^[\w:.-]+$/)
const timestamp = z.number().finite().nonnegative().nullable()
const date = z.string().refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value)
const text = z.string().max(10000)
const recordSchema = z.object({ id: idSchema, createdAt: timestamp.optional(), updatedAt: timestamp.optional() }).passthrough()
const bodySchema = z.object({ revision: z.number().int().nonnegative(), data: z.array(recordSchema).max(5000) }).strict()
const fields = {
  projects: ['name', 'description', 'status', 'deadline', 'initials', 'color', 'due', 'days'],
  tasks: ['title', 'description', 'status', 'priority', 'dueDate', 'due', 'projectId', 'team', 'position', 'subtasks', 'assigneeIds', 'accountAssigneeIds', 'assignees', 'comments', 'completedAt'],
  events: ['title', 'label', 'description', 'date', 'time', 'timeZone', 'durationMinutes', 'startsAt', 'endsAt', 'projectId', 'dstChoice', 'color'],
  team: ['name', 'email', 'role', 'department', 'photo', 'initials', 'color'],
  'time-entries': ['projectId', 'taskId', 'title', 'note', 'label', 'startedAt', 'endedAt', 'runningSince', 'segments', 'duration'],
  'daily-notes': ['date', 'note'],
  notifications: ['title', 'detail', 'projectId', 'read', 'initials'],
  settings: ['value'], 'profile-photo': ['value'],
}
const scopeOf = (user) => ({ ownerId: user.workspaceOwnerId || user.id, workspaceId: user.workspaceId })
function domain(operation) { try { return operation() } catch (error) { throw new ApiError(400, 'INVALID_INPUT', error.message) } }
export async function readWorkspace(user, transaction) {
  const { db } = getFirebase()
  if (!transaction) return db.runTransaction((current) => readWorkspace(user, current), { readOnly: true })
  const access = await verifyWorkspaceAccess(user, transaction)
  const workspace = await transaction.get(workspaceRef(user))
  if (!workspace.exists || workspace.data().ownerId !== (user.workspaceOwnerId || user.id)) throw new ApiError(404, 'NOT_FOUND', 'Workspace not found.')
  const rows = []
  for (const collection of collections) {
    const order = new Map((workspace.data().recordOrder?.[collection] || []).map((id, index) => [id, index]))
    const records = (await transaction.get(recordsRef(user, collection))).docs.map((item) => item.data())
    records.sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER))
    rows.push([collection, records])
  }
  const memberIds = access.workspaceType === 'team' ? (await transaction.get(teamRef(user.workspaceId).collection('members'))).docs.map((row) => row.id) : []
  return { revision: workspace.data().revision, collections: Object.fromEntries(rows), ...(access.workspaceType === 'team' ? { memberIds } : {}) }
}
function validateRows(collection, rows, state, user, { migration = false, preserveIds = false } = {}) {
  const scope = scopeOf(user), now = Date.now(), seen = new Set()
  const previousRows = state.collections[collection]
  const hasProject = (id) => state.collections.projects.some((project) => project.id === id)
  return rows.map((raw) => {
    recordSchema.parse(raw)
    if (seen.has(raw.id)) throw new ApiError(400, 'INVALID_INPUT', 'Record IDs must be unique.')
    seen.add(raw.id)
    const previous = migration ? undefined : previousRows.find((record) => record.id === raw.id)
    if (!previous && !preserveIds) z.uuid().parse(raw.id)
    const record = Object.fromEntries(fields[collection].filter((field) => Object.hasOwn(raw, field)).map((field) => [field, raw[field]]))
    for (const [field, value] of Object.entries(record)) if (typeof value === 'string' && field !== 'photo' && field !== 'value') text.parse(value)
    if (record.projectId && !hasProject(record.projectId) && !(collection === 'time-entries' && (migration || previous?.projectId === record.projectId))) throw new ApiError(400, 'INVALID_LINK', 'Choose a project in this workspace.')
    if (collection === 'projects') {
      z.object({ name: z.string().trim().min(1).max(200), description: text.default(''), status: z.enum(['Pending', 'In progress', 'Completed']), deadline: date.default('') }).passthrough().parse(record)
    }
    if (collection === 'tasks') {
      domain(() => taskInput(record))
      const subtasks = z.array(z.object({ id: idSchema, title: z.string().trim().min(1).max(1000), completed: z.boolean() }).strict()).max(500).parse(record.subtasks || [])
      for (const subtask of subtasks) if (!preserveIds && !previous?.subtasks?.some((sub) => sub.id === subtask.id)) z.uuid().parse(subtask.id)
      if (new Set(subtasks.map((sub) => sub.id)).size !== subtasks.length) throw new ApiError(400, 'INVALID_INPUT', 'Subtask IDs must be unique.')
      const ids = z.array(idSchema).max(100).parse(record.assigneeIds || [])
      if (ids.some((id) => !state.collections.team.some((member) => member.id === id))) throw new ApiError(400, 'INVALID_LINK', 'Choose team members in this workspace.')
      record.assigneeIds = [...new Set(ids)]; record.subtasks = subtasks
      record.assignees = ids.length ? ids.map((id) => state.collections.team.find((member) => member.id === id).initials) : z.array(z.string().max(5)).max(100).parse(record.assignees || [])
      record.position = z.number().finite().nonnegative().parse(record.position ?? 0)
      record.comments = z.number().int().nonnegative().parse(record.comments ?? 0)
      record.completedAt = migration ? timestamp.parse(record.completedAt ?? null) : completionFields(previous, record.status, now).completedAt
      if (record.accountAssigneeIds !== undefined) {
        record.accountAssigneeIds = [...new Set(z.array(idSchema).max(100).parse(record.accountAssigneeIds))]
        if (record.accountAssigneeIds.some((id) => !state.memberIds?.includes(id) && !previous?.accountAssigneeIds?.includes(id))) throw new ApiError(400, 'INVALID_LINK', 'Choose authenticated members of this team.')
      }
    }
    if (collection === 'team') Object.assign(record, domain(() => memberInput(record)))
    if (collection === 'events') {
      // Recompute instants from validated wall-clock inputs; never trust supplied instants.
      Object.assign(record, domain(() => eventInput(record)))
    }
    if (collection === 'time-entries') {
      z.object({ startedAt: z.number().finite().nonnegative(), endedAt: timestamp, runningSince: timestamp,
        segments: z.array(z.object({ start: z.number().finite().nonnegative(), end: z.number().finite().nonnegative() }).strict().refine((segment) => segment.end >= segment.start)).max(10000),
        duration: z.number().finite().nonnegative().optional(), label: z.string().max(200) }).passthrough().parse(record)
      let end = record.startedAt
      for (const segment of record.segments) { if (segment.start < end || record.endedAt !== null && segment.end > record.endedAt) throw new ApiError(400, 'INVALID_INPUT', 'Timer segments overlap or exceed the session.'); end = segment.end }
      if (record.endedAt !== null && (record.endedAt < end || record.runningSince !== null) || record.runningSince !== null && record.runningSince < end) throw new ApiError(400, 'INVALID_INPUT', 'Invalid timer timestamps.')
      if (record.endedAt !== null && record.segments.length) record.duration = record.segments.reduce((sum, segment) => sum + segment.end - segment.start, 0)
      if (record.title !== undefined) z.string().trim().max(200).parse(record.title)
      if (record.note !== undefined) text.parse(record.note)
      if (record.taskId && !state.collections.tasks.some((task) => task.id === record.taskId) && previous?.taskId !== record.taskId) throw new ApiError(400, 'INVALID_LINK', 'Choose a task in this workspace.')
    }
    if (collection === 'daily-notes') z.object({ date: date.refine(Boolean), note: text }).parse(record)
    if (collection === 'notifications') z.object({ title: z.string().max(200), detail: text, read: z.boolean() }).passthrough().parse(record)
    if (collection === 'settings') record.value = z.object({ email: z.boolean().optional(), push: z.boolean().optional(), weekly: z.boolean().optional(), product: z.boolean().optional(), compact: z.boolean().optional(), language: z.string().max(50).optional(), timeZone: z.string().max(100).optional() }).strict().parse(record.value)
    if (collection === 'profile-photo') record.value = z.string().refine((value) => !value || /^media:[0-9a-f-]{36}$/.test(value)).parse(record.value)
    const result = { ...record, id: raw.id, ...scope,
      ...(['time-entries', 'daily-notes'].includes(collection) && (user.workspaceType === 'team' || previous?.authorId) ? { authorId: previous?.authorId || user.id } : {}),
      createdAt: previous ? previous.createdAt : migration ? raw.createdAt ?? null : now, updatedAt: migration ? raw.updatedAt ?? null : now }
    if (previous && isDeepStrictEqual({ ...result, updatedAt: previous.updatedAt }, previous)) result.updatedAt = previous.updatedAt
    return result
  })
}
function cleanup(collection, oldRows, nextRows, state) {
  const removed = new Set(oldRows.filter((record) => !nextRows.some((next) => next.id === record.id)).map((record) => record.id))
  if (collection === 'projects') {
    for (const linked of ['tasks', 'events', 'notifications']) state.collections[linked] = state.collections[linked].map((record) => removed.has(record.projectId) ? { ...record, projectId: null, updatedAt: Date.now() } : record)
  }
  if (collection === 'team') state.collections.tasks = state.collections.tasks.map((task) => {
    const ids = assignedMemberIds(task, oldRows)
    if (!ids.length) return task
    const assigneeIds = ids.filter((id) => !removed.has(id))
    const unresolved = (task.assignees || []).filter((initials) => !oldRows.some((member) => member.initials === initials))
    return { ...task, assigneeIds, assignees: [...assigneeIds.map((id) => nextRows.find((member) => member.id === id)?.initials).filter(Boolean), ...unresolved] }
  })
}
export async function commitWorkspace(user, revision, operation, audit) {
  const { db } = getFirebase()
  return db.runTransaction(async (transaction) => {
    const state = await readWorkspace(user, transaction)
    if (state.revision !== revision) throw new ApiError(409, 'STALE_WORKSPACE', 'Workspace changed on another device. Refresh and try again.')
    const previous = { ...state.collections }
    await operation(state)
    // Read referenced media before any transaction writes.
    for (const member of state.collections.team) await assertPhotoOwnership(transaction, user.workspaceOwnerId || user.id, member.photo)
    for (const record of state.collections['profile-photo']) await assertPhotoOwnership(transaction, user.workspaceOwnerId || user.id, record.value)
    const mutations = []
    let bytes = 0
    for (const collection of collections) {
      const old = new Map(previous[collection].map((record) => [record.id, record])), next = state.collections[collection]
      const retained = new Set(next.map((record) => record.id))
      for (const record of previous[collection]) if (!retained.has(record.id)) mutations.push(['delete', recordsRef(user, collection).doc(record.id)])
      for (const data of next) if (!isDeepStrictEqual(old.get(data.id), data)) {
        const size = Buffer.byteLength(JSON.stringify(data)); bytes += size
        if (size > 900000) throw new ApiError(413, 'RECORD_TOO_LARGE', 'This record exceeds the Firestore document limit.')
        mutations.push(['set', recordsRef(user, collection).doc(data.id), data])
      }
    }
    if (mutations.length > 450 || bytes > 8 * 1024 * 1024) throw new ApiError(413, 'TRANSACTION_TOO_LARGE', 'Too many changed records for one atomic operation. Split the operation into smaller changes.')
    const recordOrder = Object.fromEntries(collections.map((collection) => [collection, state.collections[collection].map((record) => record.id)]))
    const orderSize = Buffer.byteLength(JSON.stringify(recordOrder))
    if (orderSize > 850000 || bytes + orderSize > 8 * 1024 * 1024) throw new ApiError(413, 'TRANSACTION_TOO_LARGE', 'Workspace ordering metadata exceeds the atomic operation limit.')
    transaction.update(workspaceRef(user), { revision: revision + 1, recordOrder })
    for (const [method, ref, data] of mutations) if (method === 'set') transaction.set(ref, data); else transaction.delete(ref)
    if (audit) transaction.create(auditRef(), audit)
    return { revision: revision + 1, collections: state.collections }
  }, { maxAttempts: 3 })
}
async function preparePhotos(user, collection, rows) {
  if (!['team', 'profile-photo'].includes(collection)) return rows
  const field = collection === 'team' ? 'photo' : 'value'
  const next = []
  for (const row of rows) next.push({ ...row, [field]: await storePhoto(user.id, row[field] || '') })
  return next
}
// Trusted offline migration only. HTTP mutations cannot request preserved legacy IDs.
export async function preparePreservedImport(user, input, { uploadPhotos = false } = {}) {
  const data = z.partialRecord(z.enum(collections), z.array(recordSchema).max(5000)).parse(input)
  const imported = Object.fromEntries(collections.map((name) => [name, data[name] || []]))
  for (const name of ['team', 'profile-photo']) {
    if (uploadPhotos) imported[name] = await preparePhotos(user, name, imported[name])
    else imported[name] = imported[name].map((row) => { const field = name === 'team' ? 'photo' : 'value'; return { ...row, [field]: '' } })
  }
  const state = { revision: 0, collections: Object.fromEntries(collections.map((name) => [name, []])) }, options = { migration: true, preserveIds: true }
  state.collections.projects = validateRows('projects', imported.projects, state, user, options)
  state.collections.team = validateRows('team', imported.team, state, user, options)
  for (const name of collections.filter((collection) => !['projects', 'team'].includes(collection))) state.collections[name] = validateRows(name, imported[name], state, user, options)
  if (new Set(state.collections.team.map((member) => member.email)).size !== state.collections.team.length || state.collections['time-entries'].filter((entry) => entry.endedAt === null).length > 1 || ['settings', 'profile-photo'].some((name) => state.collections[name].length > 1)) throw new ApiError(400, 'INVALID_IMPORT', 'Export has duplicate member emails, active timers or preference records.')
  return state.collections
}
export async function importPreservedWorkspace(user, input, audit) {
  const prepared = await preparePreservedImport(user, input, { uploadPhotos: true })
  return commitWorkspace(user, 0, (state) => {
    if (collections.some((name) => state.collections[name].length)) throw new ApiError(409, 'WORKSPACE_NOT_EMPTY', 'Reviewed export import requires a new empty workspace.')
    state.collections = prepared
  }, audit)
}
export function createRecordRoutes(auth) {
  const router = Router()
  router.use('/workspace', auth.authenticate)
  router.use('/workspace', async (req, _res, next) => { req.user = await resolveWorkspace(req.user, req.get('X-Workspace-Id')); next() })
  router.get('/workspace', async (req, res) => {
    if (req.query.revision !== undefined) {
      const revision = z.coerce.number().int().nonnegative().parse(req.query.revision)
      const current = await readWorkspace(req.user)
      if (current.revision === revision) return res.json({ revision, unchanged: true })
      return res.json(current)
    }
    res.json(await readWorkspace(req.user))
  })
  router.get('/workspace/:collection/:id', async (req, res) => {
    const model = collections.includes(req.params.collection) ? recordsRef(req.user, req.params.collection) : null
    if (!model) throw new ApiError(404, 'NOT_FOUND', 'Record not found.')
    idSchema.parse(req.params.id)
    const state = await readWorkspace(req.user), record = state.collections[req.params.collection].find((row) => row.id === req.params.id)
    if (!record) throw new ApiError(404, 'NOT_FOUND', 'Record not found.')
    res.json({ record })
  })
  router.put('/workspace/:collection', auth.csrf, async (req, res) => {
    const collection = req.params.collection
    if (!collections.includes(collection)) throw new ApiError(404, 'NOT_FOUND', 'Collection not found.')
    const { revision, data: raw } = bodySchema.parse(req.body)
    if (req.user.workspaceType === 'team' && req.user.workspaceRole !== 'owner' && ['projects', 'team', 'settings', 'profile-photo'].includes(collection)) throw new ApiError(403, 'OWNER_REQUIRED', 'Only the team owner can manage these records.')
    const data = await preparePhotos({ ...req.user, id: req.user.workspaceOwnerId || req.user.id }, collection, raw)
    const result = await commitWorkspace(req.user, revision, async (state) => {
      const oldRows = state.collections[collection]
      const next = validateRows(collection, data, state, req.user)
      if (req.user.workspaceType === 'team' && ['time-entries', 'daily-notes'].includes(collection)) {
        for (const previous of oldRows) if (previous.authorId !== req.user.id && !isDeepStrictEqual(previous, next.find((row) => row.id === previous.id))) throw new ApiError(403, 'AUTHOR_REQUIRED', 'You can edit only your own work log and notes.')
      }
      if (collection === 'team' && new Set(next.map((member) => member.email)).size !== next.length) throw new ApiError(400, 'INVALID_INPUT', 'Member emails must be unique.')
      if (collection === 'time-entries') {
        const active = next.filter((record) => record.endedAt === null).map((record) => record.authorId || req.user.id)
        if (new Set(active).size !== active.length) throw new ApiError(400, 'INVALID_INPUT', 'Only one active timer per person is allowed.')
      }
      if (collection === 'daily-notes' && new Set(next.map((record) => `${record.authorId || req.user.id}:${record.date}`)).size !== next.length) throw new ApiError(400, 'INVALID_INPUT', 'Only one daily note per person and date is allowed.')
      if (['settings', 'profile-photo'].includes(collection) && next.length > 1) throw new ApiError(400, 'INVALID_INPUT', 'Only one preference record is allowed.')
      cleanup(collection, oldRows, next, state)
      state.collections[collection] = next
    })
    res.json(result)
  })
  router.post('/workspace/migrate', auth.csrf, async (req, res) => {
    if (req.user.workspaceType === 'team') throw new ApiError(403, 'PERSONAL_ONLY', 'Local imports belong in your individual workspace.')
    const input = z.object({ revision: z.number().int().nonnegative(), confirm: z.literal('IMPORT INTO MY EMPTY WORKSPACE'), collections: z.partialRecord(z.enum(collections), z.array(recordSchema).max(5000)) }).strict().parse(req.body)
    for (const collection of ['team', 'profile-photo']) if (input.collections[collection]) input.collections[collection] = await preparePhotos(req.user, collection, input.collections[collection])
    const result = await commitWorkspace(req.user, input.revision, async (state) => {
      if (collections.some((collection) => state.collections[collection].length)) throw new ApiError(409, 'WORKSPACE_NOT_EMPTY', 'Migration requires an empty workspace. Existing local data is never deleted.')
      const maps = Object.fromEntries(collections.map((collection) => [collection, new Map((input.collections[collection] || []).map((record) => [record.id, randomUUID()]))]))
      const imported = Object.fromEntries(collections.map((collection) => [collection, (input.collections[collection] || []).map((record) => ({ ...record, id: maps[collection].get(record.id),
        ...(record.projectId ? { projectId: maps.projects.get(record.projectId) || null } : {}),
        ...(collection === 'tasks' ? { assigneeIds: (record.assigneeIds || []).map((id) => maps.team.get(id)).filter(Boolean), subtasks: (record.subtasks || []).map((sub) => ({ ...sub, id: randomUUID() })) } : {}) }))]))
      // Validate linked collections first; migration is atomic and rewrites IDs within this import only.
      state.collections.projects = validateRows('projects', imported.projects, state, req.user, { migration: true })
      state.collections.team = validateRows('team', imported.team, state, req.user, { migration: true })
      for (const collection of collections.filter((name) => !['projects', 'team'].includes(name))) state.collections[collection] = validateRows(collection, imported[collection], state, req.user, { migration: true })
      if (new Set(state.collections.team.map((member) => member.email)).size !== state.collections.team.length) throw new ApiError(400, 'INVALID_INPUT', 'Member emails must be unique.')
      if (state.collections['time-entries'].filter((entry) => entry.endedAt === null).length > 1) throw new ApiError(400, 'INVALID_INPUT', 'Only one active timer is allowed.')
      if (['settings', 'profile-photo'].some((collection) => state.collections[collection].length > 1)) throw new ApiError(400, 'INVALID_INPUT', 'Only one preference record is allowed.')
    })
    res.json(result)
  })
  return router
}
