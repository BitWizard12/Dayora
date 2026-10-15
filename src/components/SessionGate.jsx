import { useCallback, useEffect, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { AuthContext } from '../hooks/useAuth'
import { authService } from '../services/authService'
import AuthPage from '../pages/AuthPage'
import WorkspaceGate from './WorkspaceGate'
import { closeWorkspace, flushWorkspaceDrafts } from '../repositories/workspaceRepositories'

export default function SessionGate() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  const signOut = useCallback(async () => {
    await flushWorkspaceDrafts().catch(() => {})
    await authService.logout()
    closeWorkspace()
    setUser(null)
    window.location.hash = 'login'
  }, [])

  useEffect(() => {
    let active = true
    authService.session()
      .then((next) => { if (active) setUser(next) })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setReady(true) })

    const unsubscribe = authService.subscribeChanges((next) => {
      if (!active) return
      setUser(next)
      setReady(true)
      setError('')
      if (next) window.location.hash = 'dashboard'
    })
    return () => { active = false; unsubscribe() }
  }, [])

  if (!ready) return <div className="auth-main" role="status">Opening Dayora…</div>

  return <MotionConfig reducedMotion="user">
    <AuthContext.Provider value={{ user, updateUser: setUser, signOut }}>
      {user ? <WorkspaceGate key={user.id} /> : <AuthPage connectionError={error} />}
    </AuthContext.Provider>
  </MotionConfig>
}
