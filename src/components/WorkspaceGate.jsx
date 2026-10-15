import { useEffect, useMemo, useState } from 'react'
import { WorkspaceContext } from '../hooks/useWorkspace'
import useAuth from '../hooks/useAuth'
import { configureWorkspace } from '../repositories/workspaceRepositories'
import { createSupabaseWorkspaceAdapter } from '../services/supabaseWorkspaceAdapter'
import App from '../App'

export default function WorkspaceGate() {
  const { user } = useAuth()
  const [ready, setReady] = useState(false)
  const workspace = useMemo(() => ({
    id: user.id,
    ownerId: user.id,
    name: `${user.name}'s Space`,
    type: 'individual',
    role: 'owner',
  }), [user])

  useEffect(() => {
    configureWorkspace(
      { ownerId: user.id, workspaceId: user.id, actorId: user.id },
      createSupabaseWorkspaceAdapter(user.id),
    )
    setReady(true)
  }, [user.id])

  if (!ready) return <div className="auth-main" role="status">Opening your personal workspace…</div>

  return <WorkspaceContext.Provider value={{ workspace, workspaces: [workspace], members: [], busy: false, canManage: true, refresh: async () => true }}>
    <App key={user.id} />
  </WorkspaceContext.Provider>
}
