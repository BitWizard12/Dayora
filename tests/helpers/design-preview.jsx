import React from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext } from '../../src/hooks/useAuth'
import { WorkspaceContext } from '../../src/hooks/useWorkspace'
import { configureWorkspace } from '../../src/repositories/workspaceRepositories'
import App from '../../src/App'
import '../../src/styles/application.css'

// Test-only entry point: empty repository data, no auth session or remote calls.
// The production index.html never imports this fixture.
const memory = new Map()
const scope = { ownerId: 'layout-preview', workspaceId: 'layout-preview', actorId: 'layout-preview' }
configureWorkspace(scope, {
  read: async key => memory.get(key),
  write: async (key, value) => { memory.set(key, value) },
  subscribe: () => () => {},
})
const identity = { id: 'layout-preview', name: 'Design Preview', email: 'preview@example.test' }
const workspace = { id: 'layout-preview', name: 'Layout preview', type: 'preview', role: 'owner' }

createRoot(document.getElementById('root')).render(
  <AuthContext.Provider value={{ user: identity, updateUser: () => {}, signOut: () => {} }}>
    <WorkspaceContext.Provider value={{ workspace, canManage: true, workspaces: [], members: [] }}>
      <App />
    </WorkspaceContext.Provider>
  </AuthContext.Provider>,
)
