import { useCallback, useEffect, useRef, useState } from 'react'
import { WorkspaceContext } from '../hooks/useWorkspace'
import useAuth from '../hooks/useAuth'
import { workspaceService } from '../services/workspaceService'
import { configureWorkspace, flushWorkspaceDrafts } from '../repositories/workspaceRepositories'
import { createHttpWorkspaceAdapter } from '../services/httpWorkspaceAdapter'
import Onboarding from './Onboarding'
import Modal from './Modal'
import App from '../App'

export default function WorkspaceGate() {
  const { user, updateUser } = useAuth()
  const [workspaces, setWorkspaces] = useState([]), [workspace, setWorkspace] = useState(null), [members, setMembers] = useState([])
  const [error, setError] = useState(''), [setup, setSetup] = useState(false), [busy, setBusy] = useState(false)
  const selected = useRef(null), epoch = useRef(0)
  const alive = useRef(true)
  const invalidate = useCallback(() => { epoch.current++ }, [])
  const select = useCallback((next) => {
    epoch.current++
    selected.current = next
    configureWorkspace({ ownerId: next.ownerId, workspaceId: next.id, actorId: user.id }, createHttpWorkspaceAdapter(next.id))
    setWorkspace(next); setMembers([]); setError('')
  }, [user.id])
  const refresh = useCallback(async () => {
    const current = epoch.current
    const list = await workspaceService.list()
    if (!alive.current || current !== epoch.current) return
    setWorkspaces(list)
    if (!selected.current) select(list.find((item) => item.id === user.activeWorkspaceId) || list[0])
    else if (!list.some((item) => item.id === selected.current.id)) select(list[0])
    else setWorkspace(list.find((item) => item.id === selected.current.id))
    const active = selected.current
    const activeEpoch = epoch.current
    if (active?.type === 'team') {
      const accounts = await workspaceService.members(active.id)
      if (alive.current && activeEpoch === epoch.current) setMembers(accounts)
    }
  }, [select, user.activeWorkspaceId])
  useEffect(() => {
    let mounted = true
    alive.current = true
    const sync = () => refresh().catch((err) => { if (mounted) setError(err.message) })
    sync()
    const timer = setInterval(sync, 30000)
    window.addEventListener('focus', sync)
    window.addEventListener('dayora-workspace-removed', sync)
    const lifecycle = alive
    return () => { mounted = false; lifecycle.current = false; invalidate(); clearInterval(timer); window.removeEventListener('focus', sync); window.removeEventListener('dayora-workspace-removed', sync) }
  }, [refresh, invalidate])
  const switchWorkspace = async (id) => {
    if (busy || id === selected.current?.id) return
    const current = epoch.current
    setBusy(true)
    try {
      const list = await workspaceService.list(), next = list.find((item) => item.id === id)
      if (!alive.current || current !== epoch.current) return
      if (!next) throw new Error('This workspace is no longer available.')
      await flushWorkspaceDrafts()
      if (!alive.current || current !== epoch.current) return
      await workspaceService.select(next.id)
      if (!alive.current || current !== epoch.current) return
      select(next); setWorkspaces(list)
      const activeEpoch = epoch.current
      if (next.type === 'team') { const accounts = await workspaceService.members(next.id); if (alive.current && epoch.current === activeEpoch) setMembers(accounts) }
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const complete = async (next) => {
    if (!alive.current) return
    let current = epoch.current
    await flushWorkspaceDrafts()
    if (!alive.current || current !== epoch.current) return
    await refresh()
    if (!alive.current || current !== epoch.current) return
    if (next) {
      await workspaceService.select(next.id)
      if (!alive.current || current !== epoch.current) return
      select(next); current = epoch.current; await refresh()
    }
    if (!alive.current || current !== epoch.current) return
    updateUser({ ...user, onboardingComplete: true }); setSetup(false)
  }
  if (!workspace) return <div className="auth-main" role={error ? 'alert' : 'status'}>{error || 'Opening your workspace…'}{error && <button className="button button--primary" onClick={() => refresh().catch((err) => setError(err.message))}>Try again</button>}</div>
  if (!user.onboardingComplete) return <Onboarding onComplete={complete} />
  return <WorkspaceContext.Provider value={{ workspace, workspaces, members, switchWorkspace, busy, canManage: workspace.role === 'owner', refresh, openSetup: () => setSetup(true) }}>
    {error && <div className="workspace-message" role="alert">{error}</div>}
    <App key={`${user.id}:${workspace.id}`} />
    {setup && <Modal title="Make room for teamwork" onClose={() => setSetup(false)}><Onboarding teamOnly onComplete={complete} /></Modal>}
  </WorkspaceContext.Provider>
}
