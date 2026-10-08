import { localStorageAdapter } from './localStorageAdapter.js'
import { createWorkspaceRepositories } from '../repositories/workspaceRepositories.js'
import { localScope, storageKey } from '../repositories/createRepository.js'
import { api } from './api.js'

const names = { projects: 'fernly-projects', tasks: 'fernly-tasks', events: 'fernly-events', team: 'fernly-team', 'time-entries': 'fernly-tracker-v1', notifications: 'fernly-notifications', settings: 'fernly-settings', 'profile-photo': 'fernly-profile-photo' }
export async function inspectAnonymousWorkspace() {
  const local = createWorkspaceRepositories()
  const repos = { projects: local.projects, tasks: local.tasks, events: local.events, team: local.team, 'time-entries': local.timeEntries, notifications: local.notifications }
  const collections = {}
  for (const [collection, legacy] of Object.entries(names)) {
    if (await localStorageAdapter.read(storageKey(localScope, collection)) === undefined && await localStorageAdapter.read(legacy) === undefined) continue
    const repository = repos[collection] || local.valueRepository(legacy, collection === 'settings' ? {} : '')
    collections[collection] = await repository.load()
  }
  return { collections, total: Object.values(collections).reduce((sum, rows) => sum + rows.length, 0) }
}
export async function migrateAnonymousWorkspace(collections) {
  const current = await api('/workspace')
  return api('/workspace/migrate', { method: 'POST', body: { revision: current.revision, confirm: 'IMPORT INTO MY EMPTY WORKSPACE', collections } })
}
