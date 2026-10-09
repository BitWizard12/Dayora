import { motion } from 'motion/react'
import { ArrowRight, ChevronDown, MoreHorizontal, Plus, Sparkles, X } from 'lucide-react'
import Avatar from './Avatar'
import { pages } from '../data/seed'
import useAuth from '../hooks/useAuth'
import useWorkspace from '../hooks/useWorkspace'
import { useEffect, useRef, useState } from 'react'

export default function Sidebar({ sidebarOpen, page, go, tasks, team, setModal, onClose }) {
  const { user } = useAuth()
  const { workspace, workspaces, switchWorkspace, busy, openSetup, canManage } = useWorkspace()
  const drawer = useRef(null)
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1024px)').matches)
  useEffect(() => { const media = window.matchMedia('(max-width: 1024px)'); const update = () => setNarrow(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update) }, [])
  useEffect(() => {
    if (!sidebarOpen) return
    const previous = document.activeElement
    drawer.current.querySelector('.sidebar-close')?.focus()
    const key = (event) => {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key !== 'Tab') return
      const items = [...drawer.current.querySelectorAll('a[href], button, select')].filter((element) => !element.disabled && element.getClientRects().length)
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus() }
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus() }
  }, [sidebarOpen, onClose])
  return (
        <aside ref={drawer} inert={narrow && !sidebarOpen || undefined} className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`} id="sidebar">
      <button className="icon-btn sidebar-close" aria-label="Close navigation" onClick={onClose}><X size={20} /></button>
      <a href="#dashboard" className="brand" onClick={() => go('dashboard')}><span className="brand-mark"><span /></span><span>Dayora</span><span className="brand-dot">.</span></a>
      {user ? <div className="workspace-picker"><label className="workspace-switch"><span className="workspace-avatar">{workspace.name?.[0]}</span><span><span className="sr-only">Active workspace</span><select aria-label="Active workspace" value={workspace.id} disabled={busy} onChange={(event) => switchWorkspace(event.target.value)}>{workspaces.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><small>{workspace.type === 'team' ? `Team · ${workspace.role}` : 'Personal · Individual'}</small></span><ChevronDown size={15} /></label><button className="workspace-add" onClick={openSetup}><Plus size={15} /> Create or join a team</button></div> : <div className="workspace-switch"><span className="workspace-avatar">S</span><span><strong>Studio North</strong><small>Individual workspace</small></span><ChevronDown size={15} /></div>}
      <span className="nav-label">WORKSPACE</span>
      <nav className="primary-nav" aria-label="Main navigation">{pages.filter((item) => !['settings', 'help'].includes(item.id)).map(({ id, label, icon: Icon, badge }) => <a href={`#${id}`} key={id} aria-current={page === id ? 'page' : undefined} className={page === id ? 'is-active' : ''} onClick={(e) => { e.preventDefault(); go(id) }}>{page === id && <motion.span className="nav-active-indicator" layoutId="active-navigation" transition={{ duration: 0.2, ease: 'easeOut' }} />}<Icon size={18} strokeWidth={1.8} /><span>{label}</span>{badge && <span className="nav-badge">{tasks.length}</span>}</a>)}</nav>
      <div className="sidebar-section-heading"><span className="nav-label">{workspace.type === 'team' ? 'TEAM CONTACTS' : 'YOUR CONTACTS'}</span>{canManage && <button className="icon-btn icon-btn--tiny" aria-label="Add teammate" onClick={() => setModal('member')}><Plus size={16} /></button>}</div>
      <div className="sidebar-teammates">{(user ? team.slice(0, 3) : team.slice(1, 4)).map((person) => <div key={person.id}><Avatar initials={person.initials} color={person.color} photo={person.photo} small /><span>{person.name}</span><i /></div>)}<button className="sidebar-see-all" onClick={() => go('team')}>See all contacts <ArrowRight size={13} /></button></div>
      <div className="sidebar-spacer" />
      {user?.role === 'admin' && <button className="sidebar-see-all" onClick={() => go('admin')}>Dayora Admin <ArrowRight size={13} /></button>}
      <div className="sidebar-bottom">{pages.filter((item) => ['settings', 'help'].includes(item.id)).map(({ id, label, icon: Icon }) => <a href={`#${id}`} key={id} aria-current={page === id ? 'page' : undefined} className={page === id ? 'is-active' : ''} onClick={(e) => { e.preventDefault(); go(id) }}>{page === id && <motion.span className="nav-active-indicator" layoutId="active-navigation" transition={{ duration: 0.2, ease: 'easeOut' }} />}<Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === 'help' && <span className="help-dot" />}</a>)}</div>
      <button className="upgrade-card" onClick={() => go('settings')}><span className="upgrade-spark"><Sparkles size={15} /></span><strong>A little more room?</strong><span>Explore Dayora Pro for your team.</span><b>Explore plans <ArrowRight size={13} /></b></button>
      <button className="sidebar-profile" onClick={() => go('settings')}><Avatar initials={user ? user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2) : 'NC'} photo={user?.photo} /><span><strong>{user?.name || 'Noah Castell'}</strong><small>Personal account</small></span><MoreHorizontal size={18} /></button>
    </aside>
  )
}
