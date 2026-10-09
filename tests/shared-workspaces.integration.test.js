import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { backend } from './helpers/backend.js'
import { userRef } from '../server/firebaseRepositories.js'
import { FieldValue } from 'firebase-admin/firestore'
import { checkRestoredData } from '../server/restore-check.js'

const project = (name) => ({ id: randomUUID(), name, description: '', deadline: '', status: 'Pending' })
const task = (name, projectId, accounts = []) => ({ id: randomUUID(), title: name, description: '', status: 'To do', priority: 'Medium', projectId, accountAssigneeIds: accounts, subtasks: [], assigneeIds: [], position: 0 })
const session = (note, authorId) => ({ id: randomUUID(), label: 'Focus', title: 'Deployment', note, authorId, startedAt: 1000, endedAt: null, runningSince: 1000, segments: [] })
const tokenHash = (token) => createHash('sha256').update(token).digest('hex')
function inWorkspace(account, id) {
  return {
    get: (path = '/workspace') => account.agent.get(`/api${path}`).set('X-Workspace-Id', id),
    put: (collection, revision, data) => account.send('put', `/workspace/${collection}`, { revision, data }).set('X-Workspace-Id', id),
  }
}

test('onboarding, real team membership, role authorization, switching and personal/team isolation', async (t) => {
  const { account, firebase } = await backend(t), owner = await account('Owner'), member = await account('Member'), stranger = await account('Stranger')
  assert.equal((await owner.agent.get('/api/auth/session')).body.user.onboardingComplete, false)
  const privateProject = project('Private plan')
  assert.equal((await owner.send('put', '/workspace/projects', { revision: 0, data: [privateProject] })).status, 200)
  assert.equal((await member.send('post', '/workspaces/onboarding', { mode: 'individual' })).status, 200)
  assert.equal((await member.agent.get('/api/auth/session')).body.user.onboardingComplete, true)
  const created = await owner.send('post', '/workspaces', { name: 'Robotics' })
  assert.equal(created.status, 201)
  const team = created.body.workspace, shared = inWorkspace(owner, team.id), joined = inWorkspace(member, team.id)
  assert.equal(team.role, 'owner')
  assert.equal((await owner.agent.get('/api/auth/session')).body.user.onboardingComplete, true)
  assert.deepEqual((await shared.get()).body.collections.projects, [])
  const sharedProject = project('Shared plan')
  let state = (await shared.put('projects', 0, [sharedProject])).body
  assert.equal(state.collections.projects[0].ownerId, owner.user.id)
  assert.equal(state.collections.projects[0].workspaceId, team.id)
  assert.equal((await inWorkspace(stranger, team.id).get()).status, 403)
  assert.equal((await inWorkspace(stranger, team.id).get(`/workspace/projects/${sharedProject.id}`)).status, 403)
  const invited = await owner.send('post', `/workspaces/${team.id}/invites`, { email: member.user.email })
  assert.equal(invited.status, 201)
  const invite = invited.body.invite
  const stored = (await firebase.db.collection('workspaceInvites').doc(tokenHash(invite.token)).get()).data()
  assert.equal(stored.token, undefined); assert.equal(stored.workspaceId, team.id)
  assert.equal((await stranger.send('post', '/workspaces/join', { token: invite.token })).status, 400)
  assert.equal((await member.send('post', '/workspaces/join', { token: invite.token })).body.workspace.role, 'member')
  assert.equal((await member.send('post', '/workspaces/join', { token: invite.token })).status, 400)
  assert.equal((await member.agent.get('/api/workspaces')).body.workspaces.length, 2)
  assert.equal((await joined.get()).body.collections.projects[0].name, 'Shared plan')
  assert.deepEqual((await member.agent.get('/api/workspace')).body.collections.projects, [])
  assert.equal((await owner.agent.get('/api/workspace')).body.collections.projects[0].id, privateProject.id)
  assert.equal((await checkRestoredData()).workspaces, 4)
  assert.equal((await joined.put('projects', state.revision, [project('Forbidden')])).status, 403)
  assert.equal((await member.send('post', `/workspaces/${team.id}/invites`, {})).status, 403)
  assert.equal((await member.send('patch', `/workspaces/${team.id}`, { name: 'Takeover' })).status, 403)
  assert.equal((await member.send('delete', `/workspaces/${team.id}/members/${owner.user.id}`, {})).status, 403)
  assert.equal((await owner.send('delete', `/workspaces/${team.id}/members/${owner.user.id}`, {})).status, 400)
  assert.equal((await member.send('post', '/workspaces/selection', { workspaceId: team.id })).status, 200)
  assert.equal((await member.agent.get('/api/auth/session')).body.user.activeWorkspaceId, team.id)
  assert.equal((await stranger.send('post', '/workspaces/selection', { workspaceId: team.id })).status, 403)
  const work = task('Assigned deployment', sharedProject.id, [member.user.id])
  state = (await joined.put('tasks', state.revision, [work])).body
  assert.deepEqual(state.collections.tasks[0].accountAssigneeIds, [member.user.id])
  state = (await joined.put('tasks', state.revision, [{ ...state.collections.tasks[0], status: 'Done', ownerId: stranger.user.id, workspaceId: stranger.user.workspaceId }])).body
  assert.equal(state.collections.tasks[0].ownerId, owner.user.id)
  assert.equal(state.collections.tasks[0].status, 'Done')
  assert.equal((await joined.put('tasks', state.revision, [{ ...state.collections.tasks[0], accountAssigneeIds: [stranger.user.id] }])).status, 400)
  assert.equal((await owner.send('patch', `/workspaces/${team.id}`, { name: 'Campion Robotics' })).status, 200)
  const another = (await stranger.send('post', '/workspaces', { name: 'Another team' })).body.workspace
  assert.equal((await inWorkspace(member, another.id).get()).status, 403)
  assert.equal((await owner.send('delete', `/workspaces/${team.id}/members/${member.user.id}`, {})).status, 200)
  assert.equal((await joined.get()).status, 403)
  assert.equal((await joined.get(`/workspace/tasks/${work.id}`)).status, 403)
  assert.equal((await joined.put('tasks', state.revision, [])).status, 403)
  assert.equal((await member.agent.get('/api/workspaces')).body.workspaces.length, 1)
  assert.equal((await member.agent.get('/api/workspace')).status, 200)
  // Existing users need no destructive migration or invented history.
  await userRef(owner.user.id).update({ onboardingComplete: FieldValue.delete() })
  assert.equal((await owner.agent.get('/api/auth/session')).body.user.onboardingComplete, true)
  assert.equal((await owner.agent.get('/api/workspace')).body.collections.projects[0].id, privateProject.id)
})

test('invites expire, revoke, reject guessed codes and are consumed atomically by concurrent joiners', async (t) => {
  const { account, firebase } = await backend(t), owner = await account('Owner'), alice = await account('Alice'), bob = await account('Bob')
  const team = (await owner.send('post', '/workspaces', { name: 'Invites' })).body.workspace
  const invite = async () => (await owner.send('post', `/workspaces/${team.id}/invites`, {})).body.invite
  const expired = await invite()
  await firebase.db.collection('workspaceInvites').doc(expired.id).update({ expiresAt: Date.now() - 1 })
  assert.equal((await alice.send('post', '/workspaces/join', { token: expired.token })).status, 400)
  const revoked = await invite()
  assert.equal((await owner.send('delete', `/workspaces/${team.id}/invites/${revoked.id}`, {})).status, 200)
  assert.equal((await alice.send('post', '/workspaces/join', { token: revoked.token })).status, 400)
  assert.equal((await alice.send('post', '/workspaces/join', { token: 'a'.repeat(43) })).status, 400)
  const single = await invite()
  const responses = await Promise.all([alice.send('post', '/workspaces/join', { token: single.token }), bob.send('post', '/workspaces/join', { token: single.token })])
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400])
  assert.equal((await firebase.db.collection('workspaces').doc(team.id).collection('members').get()).size, 2)
})

test('shared timers, work-log notes, daily notes, author protection and analytics sessions persist', async (t) => {
  const { account } = await backend(t), owner = await account('Owner'), member = await account('Member')
  const team = (await owner.send('post', '/workspaces', { name: 'Focus' })).body.workspace
  const invite = (await owner.send('post', `/workspaces/${team.id}/invites`, {})).body.invite
  await member.send('post', '/workspaces/join', { token: invite.token })
  const a = inWorkspace(owner, team.id), b = inWorkspace(member, team.id)
  const own = session('Configured Firebase', member.user.id)
  let state = (await a.put('time-entries', 0, [own])).body
  assert.equal(state.collections['time-entries'][0].authorId, owner.user.id)
  const other = session('Prepared experiments', owner.user.id)
  state = (await b.put('time-entries', state.revision, [...state.collections['time-entries'], other])).body
  assert.equal(state.collections['time-entries'][1].authorId, member.user.id)
  assert.equal((await b.put('time-entries', state.revision, state.collections['time-entries'].map((entry) => entry.id === own.id ? { ...entry, note: 'Tampered' } : entry))).status, 403)
  assert.equal((await b.put('time-entries', state.revision, [state.collections['time-entries'][1]])).status, 403)
  state = (await a.put('time-entries', state.revision, state.collections['time-entries'].map((entry) => entry.id === own.id ? { ...entry, note: 'Tested verification', segments: [{ start: 1000, end: 46000 }], endedAt: 46000, runningSince: null, duration: 999999 } : entry))).body
  assert.equal(state.collections['time-entries'][0].duration, 45000)
  state = (await a.put('time-entries', state.revision, state.collections['time-entries'].map((entry) => entry.id === own.id ? { ...entry, title: 'After-save edit', note: 'Finished deployment' } : entry))).body
  const note = { id: randomUUID(), date: '2026-10-09', note: 'Continue tomorrow', authorId: member.user.id }
  state = (await a.put('daily-notes', state.revision, [note])).body
  assert.equal(state.collections['daily-notes'][0].authorId, owner.user.id)
  assert.equal((await b.put('daily-notes', state.revision, [{ ...state.collections['daily-notes'][0], note: 'Tampered' }])).status, 403)
  state = (await b.put('daily-notes', state.revision, [...state.collections['daily-notes'], { ...note, id: randomUUID(), note: 'My team note' }])).body
  assert.equal(state.collections['daily-notes'].length, 2)
  const restored = (await b.get()).body
  assert.equal(restored.collections['time-entries'][0].title, 'After-save edit')
  assert.equal(restored.collections['time-entries'][0].note, 'Finished deployment')
  assert.equal(restored.collections['daily-notes'][1].note, 'My team note')
  assert.deepEqual((await owner.agent.get('/api/workspace')).body.collections['daily-notes'], [])
  assert.deepEqual((await owner.agent.get('/api/workspace')).body.collections['time-entries'], [])
})

test('shared contact pictures require membership and never expose unrelated personal media', async (t) => {
  const { account } = await backend(t), owner = await account('Owner'), member = await account('Member')
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOZkAAAAASUVORK5CYII='
  const profile = await owner.send('patch', '/auth/profile', { name: 'Owner', about: '', jobTitle: '', photo })
  assert.equal(profile.status, 200)
  const privateId = profile.body.user.photo.slice(6)
  const team = (await owner.send('post', '/workspaces', { name: 'Photos' })).body.workspace
  const contact = { id: randomUUID(), name: 'Contact', email: 'contact@example.com', role: 'Engineer', photo }
  const created = await inWorkspace(owner, team.id).put('team', 0, [contact])
  assert.equal(created.status, 200)
  const id = created.body.collections.team[0].photo.slice(6)
  const path = `/api/media/${id}?workspace=${team.id}`
  assert.equal((await member.agent.get(path)).status, 403)
  const invite = (await owner.send('post', `/workspaces/${team.id}/invites`, {})).body.invite
  await member.send('post', '/workspaces/join', { token: invite.token })
  assert.equal((await member.agent.get(path)).status, 200)
  assert.equal((await member.agent.get(`/api/media/${privateId}?workspace=${team.id}`)).status, 404)
  assert.equal((await member.agent.get(`/api/media/${id}`)).status, 404)
  await owner.send('delete', `/workspaces/${team.id}/members/${member.user.id}`, {})
  assert.equal((await member.agent.get(path)).status, 403)
})
