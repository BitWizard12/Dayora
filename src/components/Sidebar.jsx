import { motion } from 'motion/react'
import { ArrowRight, ChevronDown, MoreHorizontal, Plus, Sparkles } from 'lucide-react'
import Avatar from './Avatar'
import { pages } from '../data/seed'
import useAuth from '../hooks/useAuth'

export default function Sidebar({ sidebarOpen, page, go, tasks, team, setModal }) {
  const { user } = useAuth()
  return (
        <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`} id="sidebar">
      <a href="#dashboard" className="brand" onClick={() => go('dashboard')}><span className="brand-mark"><span /></span><span>Dayora</span><span className="brand-dot">.</span></a>
      <div className="workspace-switch"><span className="workspace-avatar">{user?.name?.[0] || 'S'}</span><span><strong>{user ? user.name + "'s workspace" : 'Studio North'}</strong><small>Free workspace</small></span><ChevronDown size={15} /></div>
      <span className="nav-label">WORKSPACE</span>
      <nav className="primary-nav" aria-label="Main navigation">{pages.slice(0, 5).map(({ id, label, icon: Icon, badge }) => <a href={`#${id}`} key={id} aria-current={page === id ? 'page' : undefined} className={page === id ? 'is-active' : ''} onClick={(e) => { e.preventDefault(); go(id) }}>{page === id && <motion.span className="nav-active-indicator" layoutId="active-navigation" transition={{ duration: 0.2, ease: 'easeOut' }} />}<Icon size={18} strokeWidth={1.8} /><span>{label}</span>{badge && <span className="nav-badge">{tasks.length}</span>}</a>)}</nav>
      <div className="sidebar-section-heading"><span className="nav-label">YOUR TEAM</span><button className="icon-btn icon-btn--tiny" aria-label="Add teammate" onClick={() => setModal('member')}><Plus size={16} /></button></div>
      <div className="sidebar-teammates">{(user ? team.slice(0, 3) : team.slice(1, 4)).map((person) => <div key={person.id}><Avatar initials={person.initials} color={person.color} photo={person.photo} small /><span>{person.name}</span><i /></div>)}<button className="sidebar-see-all" onClick={() => go('team')}>See all members <ArrowRight size={13} /></button></div>
      <div className="sidebar-spacer" />
      {user?.role === 'admin' && <button className="sidebar-see-all" onClick={() => go('admin')}>Dayora Admin <ArrowRight size={13} /></button>}
      <div className="sidebar-bottom">{pages.slice(5).map(({ id, label, icon: Icon }) => <a href={`#${id}`} key={id} aria-current={page === id ? 'page' : undefined} className={page === id ? 'is-active' : ''} onClick={(e) => { e.preventDefault(); go(id) }}>{page === id && <motion.span className="nav-active-indicator" layoutId="active-navigation" transition={{ duration: 0.2, ease: 'easeOut' }} />}<Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === 'help' && <span className="help-dot" />}</a>)}</div>
      <button className="upgrade-card" onClick={() => go('settings')}><span className="upgrade-spark"><Sparkles size={15} /></span><strong>A little more room?</strong><span>Explore Dayora Pro for your team.</span><b>Explore plans <ArrowRight size={13} /></b></button>
      <button className="sidebar-profile" onClick={() => go('settings')}><Avatar initials={user ? user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2) : 'NC'} photo={user?.photo} /><span><strong>{user?.name || 'Noah Castell'}</strong><small>Personal account</small></span><MoreHorizontal size={18} /></button>
    </aside>
  )
}
