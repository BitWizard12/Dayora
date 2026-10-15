import { useCallback, useEffect, useState } from 'react'
import { WorkspaceContext } from '../hooks/useWorkspace'
import useAuth from '../hooks/useAuth'
import { workspaceService } from '../services/workspaceService'
import { configureWorkspace } from '../repositories/workspaceRepositories'
import { createHttpWorkspaceAdapter } from '../services/httpWorkspaceAdapter'
import App from '../App'

export default function WorkspaceGate() {
  const { user } = useAuth()
  const [workspace, setWorkspace] = useState(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const list = await workspaceService.list()
    const personal = list.find((item) => item.type === 'individual') || list[0]
    if (!personal) throw new Error('Your personal workspace is unavailable.')
    if (user.activeWorkspaceId !== personal.id) await workspaceService.select(personal.id)
    configureWorkspace({ ownerId: personal.ownerId, workspaceId: personal.id, actorId: user.id }, createHttpWorkspaceAdapter(personal.id))
    setWorkspace(personal)
    setError('')
  }, [user.id, user.activeWorkspaceId])

  useEffect(() => {
    let active = true
    const sync = () => refresh().catch((err) => { if (active) setError(err.message) })
    sync()
    const timer = setInterval(sync, 30000)
    window.addEventListener('focus', sync)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', sync) }
  }, [refresh])

  if (!workspace) return <div className="auth-main" role={error ? 'alert' : 'status'}>{error || 'Opening your personal workspace…'}{error && <button className="button button--primary" onClick={() => refresh().catch((err) => setError(err.message))}>Try again</button>}</div>

  return <WorkspaceContext.Provider value={{ workspace, workspaces: [workspace], members: [], busy: false, canManage: true, refresh }}>
    {error && <div className="workspace-message" role="alert">{error}</div>}
    <App key={user.id} />
  </WorkspaceContext.Provider>
}
