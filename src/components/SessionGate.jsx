import { useCallback, useEffect, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { AuthContext } from '../hooks/useAuth'
import { authService } from '../services/authService'
import { setCsrf } from '../services/api'
import AuthPage from '../pages/AuthPage'
import App from '../App'
import { configureWorkspace, refreshWorkspace, closeWorkspace } from '../repositories/workspaceRepositories'
import { createHttpWorkspaceAdapter } from '../services/httpWorkspaceAdapter'

export default function SessionGate() {
  const regression = import.meta.env.DEV && import.meta.env.MODE === 'regression'
  const [user, setUser] = useState(null), [ready, setReady] = useState(regression), [error, setError] = useState('')
  const [publicFlow, setPublicFlow] = useState(() => /^#(verify-email|reset-password)\?/.test(window.location.hash))
  const userId = user?.id
  const userWorkspaceId = user?.workspaceId
  const accept = useCallback(async (next) => { configureWorkspace({ ownerId: next.id, workspaceId: next.workspaceId }, createHttpWorkspaceAdapter()); setUser(next); setError(''); window.location.hash = 'dashboard' }, [])
  const signOut = useCallback(async () => { try { await authService.logout() } catch (err) { if (err.status !== 401) throw err } closeWorkspace(); setCsrf(); setUser(null); window.location.hash = 'login' }, [])
  useEffect(() => {
    const sync = () => setPublicFlow(/^#(verify-email|reset-password)\?/.test(window.location.hash))
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  useEffect(() => {
    if (regression) return
    let active = true
    let controller
    const check = () => {
      controller?.abort()
      const current = new AbortController(); controller = current
      authService.session({ signal: current.signal }).then((next) => { if (active && controller === current) { configureWorkspace({ ownerId: next.id, workspaceId: next.workspaceId }, createHttpWorkspaceAdapter()); setUser(next); setError('') } }).catch((err) => { if (active && controller === current && err.status !== 401 && err.name !== 'AbortError') setError(err.message) }).finally(() => { if (active && controller === current) setReady(true) })
    }
    check()
    const expired = () => { controller?.abort(); closeWorkspace(); setCsrf(); setUser(null); window.location.hash = 'login' }
    const changed = () => { closeWorkspace(); setCsrf(); setUser(null); setReady(false); check() }
    const unsubscribe = authService.subscribeChanges(changed)
    window.addEventListener('dayora-session-expired', expired)
    return () => { active = false; controller?.abort(); unsubscribe(); window.removeEventListener('dayora-session-expired', expired) }
  }, [regression])
  useEffect(() => {
    if (!userId) return
    let active = true
    const controllers = new Set()
    const sync = () => {
      if (document.visibilityState === 'hidden') return
      const controller = new AbortController(); controllers.add(controller)
      authService.session({ signal: controller.signal }).then((next) => { if (active) { if (next.id !== userId || next.workspaceId !== userWorkspaceId) configureWorkspace({ ownerId: next.id, workspaceId: next.workspaceId }, createHttpWorkspaceAdapter()); setUser(next); return refreshWorkspace() } }).catch((err) => { if (active && err.status === 401) { closeWorkspace(); setCsrf(); setUser(null); window.location.hash = 'login' } }).finally(() => controllers.delete(controller))
    }
    window.addEventListener('focus', sync)
    const interval = setInterval(sync, 30000)
    return () => { active = false; controllers.forEach((controller) => controller.abort()); window.removeEventListener('focus', sync); clearInterval(interval) }
  }, [userId, userWorkspaceId])
  if (!ready) return <div className="auth-main" role="status">Opening Dayora…</div>
  return <MotionConfig reducedMotion="user"><AuthContext.Provider value={{ user, updateUser: (next) => { if (!next) closeWorkspace(); setUser(next) }, signOut }}>
    {(user || regression) && !publicFlow ? <App key={user?.id || 'regression'} /> : <AuthPage onLogin={accept} connectionError={error} />}
  </AuthContext.Provider></MotionConfig>
}
