import { useState } from 'react'
import { motion } from 'motion/react'
import { Bell, Check, CheckCheck, ChevronRight, LogOut, SlidersHorizontal, Users } from 'lucide-react'
import Avatar from '../components/Avatar'
import SectionTitle from '../components/SectionTitle'
import useSavedState from '../hooks/useSavedState'
import useAuth from '../hooks/useAuth'
import ProfilePage from './ProfilePage'

export default function SettingsPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState('Profile')
  const [settings, setSettings] = useSavedState('fernly-settings', { email: true, push: false, weekly: true, product: false, compact: false })
  const [profilePhoto, setProfilePhoto] = useSavedState('fernly-profile-photo', '')
  const [photoError, setPhotoError] = useState('')
  const toggle = (key) => setSettings((current) => ({ ...current, [key]: !current[key] }))
  return <motion.section className="page-content" aria-label="Settings">
    <SectionTitle title="Settings" description="Make Dayora feel a little more like yours." />
    <div className="settings-layout"><nav className="settings-nav" aria-label="Settings sections">{['Profile', 'Notifications', 'Preferences', 'Security'].map((item) => <button className={tab === item ? 'is-selected' : ''} key={item} onClick={() => setTab(item)}>{item === 'Profile' ? <Users size={16} /> : item === 'Notifications' ? <Bell size={16} /> : item === 'Preferences' ? <SlidersHorizontal size={16} /> : <CheckCheck size={16} />}{item}{item === tab && <ChevronRight size={15} />}</button>)}</nav>
      <div className="settings-content">
        {tab === 'Profile' && user && <ProfilePage />}
        {tab === 'Profile' && !user && <article className="panel settings-card"><div className="settings-card__heading"><h2>Profile information</h2><p>Update your photo and personal details.</p></div><div className="profile-photo"><Avatar initials="NC" photo={profilePhoto} /><div><strong>Your profile photo</strong><span>{photoError || 'PNG or JPG. Max 2 MB.'}</span></div><label className="button button--outline button--small profile-upload">Upload photo<input type="file" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; setPhotoError(''); if (!file) return; if (file.size > 2 * 1024 * 1024) { setPhotoError('Please choose an image smaller than 2 MB.'); return } const reader = new FileReader(); reader.addEventListener('load', () => { if (typeof reader.result === 'string') setProfilePhoto(reader.result) }); reader.addEventListener('error', () => setPhotoError('Unable to read this image. Please try another file.')); reader.readAsDataURL(file) }} /></label></div><form className="settings-form" onSubmit={(e) => { e.preventDefault(); e.currentTarget.querySelector('.saved-message').textContent = 'Your changes have been saved.' }}><label>Full name<input defaultValue="Noah Castell" /></label><label>Email address<input type="email" defaultValue="noah@dayora.team" /></label><label>Role<input defaultValue="Product lead" /></label><label>About<textarea defaultValue="Building thoughtful products with kind people." rows="3" /></label><div className="settings-form__actions"><span className="saved-message" /><button className="button button--primary" type="submit">Save changes</button></div></form></article>}
        {tab === 'Notifications' && <article className="panel settings-card"><div className="settings-card__heading"><h2>Notifications</h2><p>Choose what you want to hear about.</p></div>{[['email', 'Email notifications', 'Get updates about activity in your workspace.'], ['push', 'Push notifications', 'Get notified in your browser when something changes.'], ['weekly', 'Weekly summary', 'A calm Monday recap of what your team shipped.'], ['product', 'Product updates', 'New features and improvements from Dayora.']].map(([key, title, desc]) => <div className="setting-toggle" key={key}><div><strong>{title}</strong><span>{desc}</span></div><button role="switch" aria-checked={settings[key]} className={`toggle ${settings[key] ? 'is-on' : ''}`} onClick={() => toggle(key)}><i /></button></div>)}</article>}
        {tab === 'Preferences' && <article className="panel settings-card"><div className="settings-card__heading"><h2>Workspace preferences</h2><p>Set up a workspace that works the way you do.</p></div><label className="setting-select">Language<select defaultValue="English (US)"><option>English (US)</option><option>English (UK)</option><option>Español</option></select></label><label className="setting-select">Time zone<select defaultValue="Pacific Time (PT)"><option>Pacific Time (PT)</option><option>Eastern Time (ET)</option><option>Central European Time (CET)</option></select></label><div className="setting-toggle"><div><strong>Compact layout</strong><span>See more information in a little less space.</span></div><button role="switch" aria-checked={settings.compact} className={`toggle ${settings.compact ? 'is-on' : ''}`} onClick={() => toggle('compact')}><i /></button></div><button className="button button--primary settings-save" onClick={(e) => { e.currentTarget.textContent = 'Preferences saved' }}>Save preferences</button></article>}
        {tab === 'Security' && user && <ProfilePage security />}
        {tab === 'Security' && !user && <article className="panel settings-card"><div className="settings-card__heading"><h2>Security</h2><p>Your account is protected and in good hands.</p></div><div className="security-status"><span><Check size={18} /></span><div><strong>Your account is secure</strong><p>Two-factor authentication is enabled.</p></div></div><div className="setting-toggle"><div><strong>Two-factor authentication</strong><span>Add an extra layer of security to your account.</span></div><span className="security-enabled"><Check size={14} /> Enabled</span></div><div className="session-row"><div><strong>Active session</strong><span>Windows · This device · Last active just now</span></div><span className="current-session">Current</span></div><button className="button button--outline"><LogOut size={15} /> Sign out of all other sessions</button></article>}
      </div>
    </div>
  </motion.section>
}

