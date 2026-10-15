import { useState } from 'react'
import useAuth from '../hooks/useAuth'
import { authService } from '../services/authService'
import Avatar from '../components/Avatar'

export default function ProfilePage({ security = false }) {
  const { user, updateUser, signOut } = useAuth()
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const run = async (operation) => { setBusy(true); setError(''); setMessage(''); try { await operation() } catch (err) { setError(err.message) } finally { setBusy(false) } }

  if (security) return <article className="panel settings-card">
    <div className="settings-card__heading"><h2>Account security</h2><p>Your Dayora session is managed by Supabase authentication.</p></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="account-actions profile-security"><button className="button button--outline" disabled={busy} onClick={() => run(signOut)}>Sign out</button></div>
  </article>

  return <article className="panel settings-card">
    <div className="settings-card__heading"><h2>Profile information</h2><p>Your profile belongs to your private Dayora account.</p></div>
    {error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="profile-photo"><Avatar initials={user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2)} photo={user.photo} /></div>
    <form className="settings-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(async () => { updateUser(await authService.profile({ name: data.get('name'), jobTitle: data.get('jobTitle'), about: data.get('about') })); setMessage('Profile saved.') }) }}>
      <label>Full name<input name="name" defaultValue={user.name} maxLength={100} required /></label>
      <label>Email<input value={user.email} readOnly type="email" /></label>
      <label>Role<input name="jobTitle" defaultValue={user.jobTitle} maxLength={100} /></label>
      <label>About<textarea name="about" defaultValue={user.about} maxLength={2000} rows={3} /></label>
      <button className="button button--primary" disabled={busy}>Save changes</button>
    </form>
  </article>
}
