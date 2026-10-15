import { useState } from 'react'
import { motion } from 'motion/react'
import { Leaf } from 'lucide-react'
import { authService } from '../services/authService'
import { pageEntrance } from '../styles/motion'
import '../styles/auth.css'

export default function AuthPage({ connectionError }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const signIn = async () => {
    setBusy(true)
    setError('')
    try {
      await authService.loginWithGoogle()
    } catch (err) {
      setError(err.message || 'Unable to start Google sign-in.')
      setBusy(false)
    }
  }

  return <div className="auth-shell">
    <aside className="auth-story">
      <a href="#login" className="brand"><span className="brand-mark"><span /></span>Dayora<span className="brand-dot">.</span></a>
      <div><Leaf size={44} /><h1>Your Day,<br />Your Way.</h1><p>Your private space for projects, tasks, focus, notes and progress.</p></div>
      <small>Your Dayora data stays private to your account.</small>
    </aside>
    <main className="auth-main">
      <motion.section className="auth-card" variants={pageEntrance} initial="hidden" animate="visible">
        <span className="eyebrow">DAYORA</span>
        <h2>Welcome to Dayora</h2>
        <p>Sign in with Google to open your private personal workspace on any device.</p>
        {connectionError && <p role="alert" className="form-error">{connectionError}</p>}
        {error && <p role="alert" className="form-error">{error}</p>}
        <button disabled={busy} className="button button--primary modal-submit" onClick={signIn}>
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <p className="auth-link">No Dayora password or separate account required.</p>
      </motion.section>
    </main>
  </div>
}
