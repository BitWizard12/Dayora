import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Leaf, ArrowRight } from 'lucide-react'
import { authService } from '../services/authService'
import { parseAuthRoute } from '../services/authRoutes'
import { pageEntrance } from '../styles/motion'
import '../styles/auth.css'

const route = () => parseAuthRoute(window.location.hash)
export default function AuthPage({ onLogin, connectionError }) {
  const [state, setState] = useState(route)
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { const sync = () => { setState(route()); setMessage(''); setError('') }; window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync) }, [])
  const title = { login: 'Welcome back', signup: 'Make room for a better day', 'forgot-password': 'Forgot your password?', 'reset-password': 'Choose a new password', 'verify-email': 'Verify your email' }[state.view]
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    const data = new FormData(event.currentTarget)
    try {
      let result
      if (state.view === 'login') { const user = await authService.login({ email: data.get('email'), password: data.get('password'), remember: data.get('remember') === 'on' }); await onLogin(user); return }
      if (state.view === 'signup') result = await authService.signup({ name: data.get('name'), email: data.get('email'), password: data.get('password') })
      if (state.view === 'forgot-password') result = await authService.forgot(data.get('email'))
      if (state.view === 'reset-password') result = await authService.reset(state.token, data.get('password'))
      if (state.view === 'verify-email') result = await authService.verify(state.token)
      setMessage(result.message)
      if (['reset-password', 'verify-email'].includes(state.view)) { setState({ view: 'login', token: '' }); window.history.replaceState(null, '', '#login') }
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <div className="auth-shell"><aside className="auth-story"><a href="#login" className="brand"><span className="brand-mark"><span /></span>Dayora<span className="brand-dot">.</span></a><div><Leaf size={44} /><h1>Your Day,<br />Your Way.</h1><p>A thoughtful space for your projects, your focus, and the people you work with.</p></div><small>Your workspace stays private to your account.</small></aside><main className="auth-main"><motion.section key={state.view} className="auth-card" variants={pageEntrance} initial="hidden" animate="visible"><span className="eyebrow">DAYORA</span><h2>{title}</h2><p>{state.view === 'signup' ? 'Start with your own private workspace.' : 'A calmer, more focused day starts here.'}</p>{connectionError && <p role="alert">{connectionError}</p>}<form className="modal-form" onSubmit={submit}>
    {state.view === 'signup' && <label>Full name<input name="name" autoComplete="name" maxLength={100} required /></label>}
    {['login', 'signup', 'forgot-password'].includes(state.view) && <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>}
    {['login', 'signup', 'reset-password'].includes(state.view) && <label>Password<input name="password" aria-label="Password" type="password" autoComplete={state.view === 'login' ? 'current-password' : 'new-password'} minLength={state.view === 'login' ? 1 : 12} maxLength={128} required />{state.view !== 'login' && <small>Use at least 12 characters.</small>}</label>}
    {state.view === 'login' && <div className="auth-options"><label><input name="remember" type="checkbox" /> Keep me signed in</label><a href="#forgot-password">Forgot password?</a></div>}
    {state.view === 'verify-email' && <p>Confirm your email to activate your Dayora account.</p>}
    {error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status" className="auth-success">{message}</p>}
    <button disabled={busy} className="button button--primary modal-submit">{busy ? 'Please wait…' : { login: 'Sign in', signup: 'Create account', 'forgot-password': 'Send reset link', 'reset-password': 'Reset password', 'verify-email': 'Verify email' }[state.view]}<ArrowRight size={16} /></button>
    </form>{state.view === 'login' && <button className="text-button" disabled={busy} onClick={async () => { const email = document.querySelector('[name=email]')?.value; if (!email) { setError('Enter your email above first.'); return } setBusy(true); setError(''); setMessage(''); try { setMessage((await authService.resend(email)).message) } catch (err) { setError(err.message) } finally { setBusy(false) } }}>Resend verification email</button>}<p className="auth-link">{state.view === 'login' ? <>New to Dayora? <a href="#signup">Create an account</a></> : <a href="#login">Back to sign in</a>}</p></motion.section></main></div>
}
