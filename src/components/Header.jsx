import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, Bell, ChevronDown, ChevronRight, Command, Menu, MessageSquare, Search } from 'lucide-react'
import Avatar from './Avatar'
import { useEffect, useRef } from 'react'
import useAuth from '../hooks/useAuth'

export default function Header({ sidebarOpen, setSidebarOpen, page, pageTitle, search, setSearch, searchOpen, setSearchOpen, searchResults, go, panel, setPanel, notifications, clearNotifications, onProject, onTask, onNotification }) {
  const { user } = useAuth()
  const header = useRef(null)
  useEffect(() => {
    const dismiss = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type === 'pointerdown' && header.current?.contains(event.target)) return
      setPanel(''); setSearchOpen(false)
    }
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('keydown', dismiss)
    return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', dismiss) }
  }, [setPanel, setSearchOpen])
  return (
<header ref={header} className="topbar"><button className="icon-btn topbar-menu" aria-label="Open menu" aria-expanded={sidebarOpen} aria-controls="sidebar" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><div className="breadcrumbs"><span>{user ? user.name + "'s workspace" : 'Studio North'}</span><ChevronRight size={14} /><strong>{pageTitle}</strong></div>
      <div className="topbar-search-wrap"><label className="topbar-search"><Search size={16} /><input aria-label="Search projects, tasks, and people" placeholder={page === 'dashboard' ? 'Search projects and people' : `Search ${page}`} value={search} onFocus={() => setSearchOpen(true)} onChange={(e) => { setSearch(e.target.value); setSearchOpen(true) }} onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)} /><kbd><Command size={11} /> K</kbd><button className="search-trigger" aria-label="Open search" onClick={() => { setSearchOpen(!searchOpen); document.querySelector('.topbar-search input')?.focus() }} /></label>
        <AnimatePresence>{searchOpen && search && <motion.div className="search-results" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}><span className="search-results__label">SEARCH RESULTS</span>{searchResults.length ? searchResults.map((result) => <button key={`${result.type}-${result.id || result.label}`} onClick={() => { if (result.type === 'Project') onProject(result.id); else if (result.type === 'Task') onTask(result.id); else go(result.page); setSearchOpen(false); setSearch('') }}><span className="search-result-icon"><Search size={14} /></span><span>{result.label}<small>{result.type}</small></span><ArrowUpRight size={15} /></button>) : <p>No results found. Try another search.</p>}</motion.div>}</AnimatePresence>
      </div>
      <div className="topbar-actions">{!user && <div className="popover-wrap"><button className="icon-btn topbar-action" aria-expanded={panel === 'messages'} aria-label="Messages, 2 unread" onClick={() => setPanel(panel === 'messages' ? '' : 'messages')}><MessageSquare size={18} /><i className="notification-dot" /></button>{panel === 'messages' && <div className="menu-popover header-popover"><div className="popover-heading"><strong>Messages</strong><button onClick={() => go('team')}>View team</button></div><p className="message-preview"><Avatar initials="PR" color="peach" small /><span><b>Priya Raman</b><small>Could you take a look at the new flow?</small></span><i>12m</i></p><p className="message-preview"><Avatar initials="HK" color="lilac" small /><span><b>Hana Kobayashi</b><small>API changes are ready for review.</small></span><i>1h</i></p></div>}</div>}<div className="popover-wrap"><button className="icon-btn topbar-action" aria-expanded={panel === 'notifications'} aria-label={`Notifications, ${notifications.filter((n) => !n.read).length} new`} onClick={() => setPanel(panel === 'notifications' ? '' : 'notifications')}><Bell size={18} />{notifications.some((n) => !n.read) && <i className="notification-dot" />}</button>{panel === 'notifications' && <div className="menu-popover header-popover notifications-popover"><div className="popover-heading"><strong>Notifications <span>{notifications.filter((n) => !n.read).length}</span></strong><button onClick={clearNotifications}>Mark all read</button></div>{notifications.map((item) => <button onClick={() => onNotification(item)} className={`notification-item ${item.read ? '' : 'is-unread'}`} key={item.id}><Avatar initials={item.initials} color={item.initials === 'HK' ? 'lilac' : item.initials === 'PR' ? 'peach' : 'sage'} small /><div><strong>{item.title}</strong><p>{item.detail}</p></div>{!item.read && <i />}</button>)}</div>}</div><button className="topbar-account" onClick={() => go('settings')}><Avatar initials={user ? user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2) : 'NC'} photo={user?.photo} /><span>{user?.name || 'Noah Castell'}</span><ChevronDown size={14} /></button></div>
    </header>
  )
}
