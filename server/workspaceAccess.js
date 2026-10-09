import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { getFirebase } from './firebaseAdmin.js'
import { userRef, workspaceRef } from './firebaseRepositories.js'
import { ApiError } from './errors.js'

const identifier = z.string().min(1).max(150).regex(/^[\w.-]+$/)
const nameSchema = z.string().trim().min(1).max(100)
const digest = (token) => createHash('sha256').update(token).digest('hex')
export const teamRef = (id) => getFirebase().db.collection('workspaces').doc(identifier.parse(id))
const pointerRef = (uid, id) => userRef(uid).collection('memberships').doc(id)
const unavailable = () => new ApiError(403, 'WORKSPACE_FORBIDDEN', 'This workspace is unavailable or you are no longer a member.')
const summary = (data, role) => ({ id: data.workspaceId, ownerId: data.ownerId, name: data.name, type: 'team', role })

// The requested ID is a selector only. Membership and ownership are re-read by
// every data transaction, including writes racing with member removal.
export async function resolveWorkspace(user, requested, transaction) {
  const read = (ref) => transaction ? transaction.get(ref) : ref.get()
  const personalId = user.personalWorkspaceId || user.workspaceId
  const id = requested || personalId
  identifier.parse(id)
  if (id === personalId) return { ...user, personalWorkspaceId: personalId, workspaceId: id, workspaceOwnerId: user.id, workspaceType: 'individual', workspaceRole: 'owner' }
  const ref = teamRef(id)
  const [workspace, member] = await Promise.all([read(ref), read(ref.collection('members').doc(user.id))])
  const data = workspace.data(), membership = member.data()
  if (!data || !membership || !['owner', 'member'].includes(membership.role)) throw unavailable()
  const owner = await read(userRef(data.ownerId))
  if (!owner.data()?.active || membership.role === 'owner' && data.ownerId !== user.id) throw unavailable()
  return { ...user, personalWorkspaceId: personalId, workspaceId: id, workspaceOwnerId: data.ownerId, workspaceType: 'team', workspaceRole: membership.role }
}

export async function verifyWorkspaceAccess(user, transaction) {
  const identity = (await transaction.get(userRef(user.id))).data()
  if (!identity?.active || identity.workspaceId !== (user.personalWorkspaceId || user.workspaceId) || identity.sessionVersion !== user.sessionVersion) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has changed. Please sign in.')
  const current = await resolveWorkspace({ ...identity, id: user.id }, user.workspaceId, transaction)
  if (current.workspaceOwnerId !== (user.workspaceOwnerId || user.id)) throw unavailable()
  return current
}

export async function listWorkspaces(user) {
  const personal = { id: user.workspaceId, ownerId: user.id, name: `${user.name}'s Space`, type: 'individual', role: 'owner' }
  const pointers = await userRef(user.id).collection('memberships').get()
  const teams = []
  for (const pointer of pointers.docs) {
    try { const resolved = await resolveWorkspace(user, pointer.id); const data = (await teamRef(pointer.id).get()).data(); if (data) teams.push(summary(data, resolved.workspaceRole)) }
    catch (error) { if (error.code !== 'WORKSPACE_FORBIDDEN') throw error }
  }
  return [personal, ...teams]
}

export async function createTeam(user, name) {
  name = nameSchema.parse(name)
  const id = randomUUID(), now = Date.now(), ref = teamRef(id)
  const data = { workspaceId: id, ownerId: user.id, name, type: 'team', createdAt: now, memberCount: 1 }
  await getFirebase().db.runTransaction(async (tx) => {
    await verifyWorkspaceAccess(user, tx)
    const memberships = await tx.get(userRef(user.id).collection('memberships'))
    if (memberships.size >= 20) throw new ApiError(409, 'WORKSPACE_LIMIT', 'You can belong to up to 20 teams.')
    tx.create(ref, data)
    tx.create(ref.collection('members').doc(user.id), { userId: user.id, role: 'owner', joinedAt: now })
    tx.create(pointerRef(user.id, id), { workspaceId: id, ownerId: user.id, joinedAt: now })
    tx.create(workspaceRef({ id: user.id, workspaceId: id }), { ownerId: user.id, workspaceId: id, name, type: 'team', revision: 0, createdAt: now })
    tx.update(userRef(user.id), { onboardingComplete: true })
  })
  return summary(data, 'owner')
}

async function ownerTransaction(user, id, operation) {
  return getFirebase().db.runTransaction(async (tx) => {
    const identity = (await tx.get(userRef(user.id))).data()
    if (!identity?.active || identity.sessionVersion !== user.sessionVersion) throw unavailable()
    const resolved = await resolveWorkspace({ ...identity, id: user.id }, id, tx)
    if (resolved.workspaceType !== 'team' || resolved.workspaceRole !== 'owner') throw new ApiError(403, 'OWNER_REQUIRED', 'Only the team owner can do this.')
    return operation(tx, teamRef(id), resolved)
  })
}

export async function createInvite(user, id, email = '') {
  const token = randomBytes(32).toString('base64url'), hash = digest(token), now = Date.now()
  const ref = getFirebase().db.collection('workspaceInvites').doc(hash)
  const data = { workspaceId: id, createdBy: user.id, createdAt: now, expiresAt: now + 7 * 86400000, email: email ? z.email().max(254).parse(email).toLowerCase() : '', usedAt: null, revokedAt: null }
  await ownerTransaction(user, id, async (tx) => {
    const existing = await tx.get(getFirebase().db.collection('workspaceInvites').where('workspaceId', '==', id))
    if (existing.docs.filter((doc) => !doc.data().usedAt && !doc.data().revokedAt && doc.data().expiresAt > now).length >= 25) throw new ApiError(409, 'INVITE_LIMIT', 'Revoke an active invite before creating another.')
    tx.create(ref, data)
  })
  return { id: hash, token, expiresAt: data.expiresAt, email: data.email }
}

export async function joinTeam(user, token) {
  z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(token)
  const ref = getFirebase().db.collection('workspaceInvites').doc(digest(token))
  return getFirebase().db.runTransaction(async (tx) => {
    await verifyWorkspaceAccess(user, tx)
    const invitation = (await tx.get(ref)).data(), now = Date.now()
    if (!invitation || invitation.usedAt || invitation.revokedAt || invitation.expiresAt <= now || invitation.email && invitation.email !== user.email) throw new ApiError(400, 'INVITE_UNAVAILABLE', 'This invite is expired, revoked, used, or unavailable for this email.')
    const workspace = teamRef(invitation.workspaceId), data = (await tx.get(workspace)).data()
    if (!data || !(await tx.get(userRef(data.ownerId))).data()?.active) throw unavailable()
    const membership = workspace.collection('members').doc(user.id)
    if ((await tx.get(membership)).exists) throw new ApiError(409, 'ALREADY_MEMBER', 'You already belong to this team.')
    if ((await tx.get(userRef(user.id).collection('memberships'))).size >= 20 || data.memberCount >= 100) throw new ApiError(409, 'WORKSPACE_LIMIT', 'This account or team has reached its membership limit.')
    tx.create(membership, { userId: user.id, role: 'member', joinedAt: now })
    tx.create(pointerRef(user.id, workspace.id), { workspaceId: workspace.id, ownerId: data.ownerId, joinedAt: now })
    tx.update(workspace, { memberCount: data.memberCount + 1 })
    tx.update(ref, { usedAt: now, usedBy: user.id })
    tx.update(userRef(user.id), { onboardingComplete: true })
    return summary(data, 'member')
  })
}

export function createWorkspaceRoutes(auth) {
  const router = Router()
  router.use('/workspaces', auth.authenticate)
  router.get('/workspaces', async (req, res) => res.json({ workspaces: await listWorkspaces(req.user) }))
  router.post('/workspaces/selection', auth.csrf, async (req, res) => {
    const { workspaceId } = z.object({ workspaceId: identifier }).strict().parse(req.body)
    await getFirebase().db.runTransaction(async (tx) => {
      await verifyWorkspaceAccess(req.user, tx)
      await resolveWorkspace(req.user, workspaceId, tx)
      tx.update(userRef(req.user.id), { activeWorkspaceId: workspaceId })
    })
    res.json({ selected: true })
  })
  router.post('/workspaces/onboarding', auth.csrf, async (req, res) => {
    z.object({ mode: z.literal('individual') }).strict().parse(req.body)
    await userRef(req.user.id).update({ onboardingComplete: true })
    res.json({ completed: true })
  })
  router.post('/workspaces', auth.csrf, async (req, res) => { const { name } = z.object({ name: nameSchema }).strict().parse(req.body); res.status(201).json({ workspace: await createTeam(req.user, name) }) })
  router.post('/workspaces/join', auth.csrf, async (req, res) => { const { token } = z.object({ token: z.string() }).strict().parse(req.body); res.json({ workspace: await joinTeam(req.user, token) }) })
  router.get('/workspaces/:id/members', async (req, res) => {
    const members = await getFirebase().db.runTransaction(async (tx) => {
      const resolved = await resolveWorkspace(req.user, req.params.id, tx)
      if (resolved.workspaceType !== 'team') throw unavailable()
      const rows = await tx.get(teamRef(req.params.id).collection('members'))
      const result = []
      for (const row of rows.docs) { const account = (await tx.get(userRef(row.id))).data(); if (account) result.push({ id: row.id, name: account.name, email: account.email, role: row.data().role, joinedAt: row.data().joinedAt }) }
      return result
    }, { readOnly: true })
    res.json({ members })
  })
  router.patch('/workspaces/:id', auth.csrf, async (req, res) => {
    const { name } = z.object({ name: nameSchema }).strict().parse(req.body)
    await ownerTransaction(req.user, req.params.id, (tx, ref, resolved) => { tx.update(ref, { name }); tx.update(workspaceRef(resolved), { name }) })
    res.json({ saved: true })
  })
  router.delete('/workspaces/:id/members/:uid', auth.csrf, async (req, res) => {
    const uid = identifier.parse(req.params.uid)
    await ownerTransaction(req.user, req.params.id, async (tx, ref, resolved) => {
      if (uid === resolved.workspaceOwnerId) throw new ApiError(400, 'OWNER_REQUIRED', 'The team owner cannot be removed.')
      const member = await tx.get(ref.collection('members').doc(uid)), data = (await tx.get(ref)).data()
      if (!member.exists) throw unavailable()
      tx.delete(member.ref); tx.delete(pointerRef(uid, ref.id)); tx.update(ref, { memberCount: data.memberCount - 1 })
    })
    res.json({ removed: true })
  })
  router.get('/workspaces/:id/invites', async (req, res) => {
    const invites = await ownerTransaction(req.user, req.params.id, async (tx) => (await tx.get(getFirebase().db.collection('workspaceInvites').where('workspaceId', '==', req.params.id))).docs.map((row) => ({ id: row.id, ...row.data() })))
    res.json({ invites })
  })
  router.post('/workspaces/:id/invites', auth.csrf, async (req, res) => { const { email } = z.object({ email: z.string().default('') }).strict().parse(req.body); res.status(201).json({ invite: await createInvite(req.user, req.params.id, email) }) })
  router.delete('/workspaces/:id/invites/:inviteId', auth.csrf, async (req, res) => {
    const hash = z.string().regex(/^[a-f0-9]{64}$/).parse(req.params.inviteId)
    await ownerTransaction(req.user, req.params.id, async (tx) => {
      const ref = getFirebase().db.collection('workspaceInvites').doc(hash), invite = (await tx.get(ref)).data()
      if (!invite || invite.workspaceId !== req.params.id) throw unavailable()
      tx.update(ref, { revokedAt: Date.now() })
    })
    res.json({ revoked: true })
  })
  return router
}
