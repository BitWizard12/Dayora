import { api } from './api.js'

export const workspaceService = {
  list: () => api('/workspaces').then((result) => result.workspaces),
  select: (workspaceId) => api('/workspaces/selection', { method: 'POST', body: { workspaceId } }),
  completeIndividual: () => api('/workspaces/onboarding', { method: 'POST', body: { mode: 'individual' } }),
  create: (name) => api('/workspaces', { method: 'POST', body: { name } }).then((result) => result.workspace),
  join: (token) => api('/workspaces/join', { method: 'POST', body: { token: token.trim() } }).then((result) => result.workspace),
  members: (id) => api(`/workspaces/${id}/members`).then((result) => result.members),
  rename: (id, name) => api(`/workspaces/${id}`, { method: 'PATCH', body: { name } }),
  removeMember: (id, uid) => api(`/workspaces/${id}/members/${uid}`, { method: 'DELETE' }),
  invites: (id) => api(`/workspaces/${id}/invites`).then((result) => result.invites),
  invite: (id, email = '') => api(`/workspaces/${id}/invites`, { method: 'POST', body: { email } }).then((result) => result.invite),
  revoke: (id, inviteId) => api(`/workspaces/${id}/invites/${inviteId}`, { method: 'DELETE' }),
}
