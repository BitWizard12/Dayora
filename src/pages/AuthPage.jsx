import { useState } from 'react'
import { motion } from 'motion/react'
import { Leaf } from 'lucide-react'
import { authService } from '../services/authService'
import { pageEntrance } from '../styles/motion'
import '../styles/auth.css'

export default function AuthPage({ onLogin, connectionError }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const signIn = async () => {
    setBusy(true); setError('')
    try {
      const user = await authService.loginWithGoogle()
      await onLogin(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return <div className="auth-shell">
    <aside className="auth-story">
      <a href="#login" className="brand"><span className="brand-mark"><span /></span>Dayora<span className="brand-dot">.</span></a>
      <div><Leaf size={44} /><h1>Your Day,<br />Your Way.</h1><p>Your private space for projects, tasks, focus, notes and progress — synced to your Google account.</p></div>
      <small>Your Dayora data stays private to your account.</small>
    </aside>
    <main className="auth-main">
      <motion.section className="auth-card" variants={pageEntrance} initial="hidden" animate="visible">
        <span className="eyebrow">DAYORA</span>
        <h2>Welcome to Dayora</h2>
        <p>Sign in with Google to open your personal workspace on any device.</p>
        {connectionError && <p role="alert">{connectionError}</p>}
        {error && <p role="alert" className="form-error">{error}</p>}
        <button disabled={busy} className="button button--primary modal-submit" onClick={signIn}>
          {busy ? 'Signing in…' : 'Continue with Google'}
        </button>
        <p className="auth-link">No password, sign-up form or verification email required.</p>
      </motion.section>
    </main>
  </div>
}
