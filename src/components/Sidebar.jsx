import { motion } from 'motion/react'
import { ArrowRight, MoreHorizontal, X } from 'lucide-react'
import Avatar from './Avatar'
import { pages } from '../data/seed'
import useAuth from '../hooks/useAuth'
import useWorkspace from '../hooks/useWorkspace'
import { useEffect, useRef, useState } from 'react'

export default function Sidebar({ sidebarOpen, page, go, tasks, onClose }) {
  const { user } = useAuth()
  const { workspace } = useWorkspace()
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
      const items = [...drawer.current.querySelectorAll('a[href], button')].filter((element) => !element.disabled && element.getClientRects().length)
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus() }
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus() }
  }, [sidebarOpen, onClose])

  return <aside ref={drawer} inert={narrow && !sidebarOpen || undefined} className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`} id="sidebar">
    <button className="icon-btn sidebar-close" aria-label="Close navigation" onClick={onClose}><X size={20} /></button>
    <a href="#dashboard" className="brand" onClick={() => go('dashboard')}><span className="brand-mark"><span /></span><span>Dayora</span><span className="brand-dot">.</span></a>

    <div className="workspace-picker">
      <div className="workspace-switch">
        <span className="workspace-avatar">{workspace.name?.[0] || user?.name?.[0] || 'D'}</span>
        <span><strong>{workspace.name || 'My Dayora'}</strong><small>Private personal workspace</small></span>
      </div>
    </div>

    <span className="nav-label">MY DAYORA</span>
    <nav className="primary-nav" aria-label="Main navigation">
      {pages.filter((item) => !['settings', 'help'].includes(item.id)).map(({ id, label, icon: Icon, badge }) =>
        <a href={`#${id}`} key={id} aria-current={page === id ? 'page' : undefined} className={page === id ? 'is-active' : ''} onClick={(e) => { e.preventDefault(); go(id) }}>
          {page === id && <motion.span className="nav-active-indicator" layoutId="active-navigation" transition={{ duration: 0.2, ease: 'easeOut' }} />}
          <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{badge && <span className="nav-badge">{tasks.length}</span>}
        </a>)}
    </nav>

    <div className="sidebar-spacer" />
    {user?.role === 'admin' && <button className="sidebar-see-all" onClick={() => go('admin')}>Dayora Admin <ArrowRight size={13} /></button>}
    <div className="sidebar-bottom">
      {pages.filter((item) => ['settings', 'help'].includes(item.id)).map(({ id, label, icon: Icon }) =>
        <a href={`#${id}`} key={id} aria-current={page === id ? 'page' : undefined} className={page === id ? 'is-active' : ''} onClick={(e) => { e.preventDefault(); go(id) }}>
          {page === id && <motion.span className="nav-active-indicator" layoutId="active-navigation" transition={{ duration: 0.2, ease: 'easeOut' }} />}
          <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === 'help' && <span className="help-dot" />}
        </a>)}
    </div>

    <button className="sidebar-profile" onClick={() => go('settings')}>
      <Avatar initials={user ? user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2) : 'D'} photo={user?.photo} />
      <span><strong>{user?.name || 'Dayora User'}</strong><small>Google account · Personal</small></span><MoreHorizontal size={18} />
    </button>
  </aside>
}
