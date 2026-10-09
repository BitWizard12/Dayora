import Sidebar from './components/Sidebar'
import Header from './components/Header'

import useRepository from './hooks/useRepository'
import { workspaceRepositories } from './repositories/workspaceRepositories'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { pages } from './data/seed'
import { Download } from 'lucide-react'
import Modal from './components/Modal'
import ProjectDialog from './components/ProjectDialog'
import TaskDialog from './components/TaskDialog'
import EventDialog from './components/EventDialog'
import MemberDialog from './components/MemberDialog'
import { pageEntrance } from './styles/motion'
import './App.css'
import './styles/phase4.css'
import useAuth from './hooks/useAuth'
import AnonymousMigration from './components/AnonymousMigration'
import useWorkspace from './hooks/useWorkspace'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const TaskBoard = lazy(() => import('./pages/TaskBoard'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const WorkLogPage = lazy(() => import('./pages/WorkLogPage'))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'))

function App() {
  const { user } = useAuth()
  const { workspace } = useWorkspace()
  const [page, setPage] = useState(() => window.location.hash === '#admin' && user?.role === 'admin' ? 'admin' : pages.some((item) => item.id === window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [panel, setPanel] = useState('')
  const [modal, setModal] = useState('')
  const taskState = useRepository(workspaceRepositories.tasks)
  const projectState = useRepository(workspaceRepositories.projects)
  const teamState = useRepository(workspaceRepositories.team)
  const eventState = useRepository(workspaceRepositories.events)
  const timeState = useRepository(workspaceRepositories.timeEntries)
  const notificationState = useRepository(workspaceRepositories.notifications)
  const tasks = taskState.data
  const projects = projectState.data
  const team = teamState.data
  const notifications = notificationState.data
  const [projectDialog, setProjectDialog] = useState(null)
  const [taskDialog, setTaskDialog] = useState(null)
  const [eventDialog, setEventDialog] = useState(null)
  const [memberDialog, setMemberDialog] = useState(null)
  const dataError = [taskState, projectState, teamState, eventState, timeState, notificationState].find((state) => state.error)?.error
  useEffect(() => {
    const sync = () => { const next = window.location.hash.slice(1); setPage(next === 'admin' && user?.role === 'admin' || pages.some((item) => item.id === next) ? next : 'dashboard') }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [user?.role])
  useEffect(() => {
    const onKey = (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); document.querySelector('.topbar-search input')?.focus() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const go = useCallback((id) => { window.location.hash = id; setPage(id); setSidebarOpen(false); setPanel('') }, [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const openProject = useCallback((id) => { setProjectDialog({ mode: 'details', id }); setSearchOpen(false); setPanel('') }, [])
  const openModal = useCallback((kind) => { if (kind === 'project') setProjectDialog({ mode: 'create' }); else if (kind === 'task') setTaskDialog({ status: 'To do' }); else if (kind === 'event') setEventDialog({}); else if (kind === 'member') setMemberDialog({}); else setModal(kind) }, [])
  const openTask = useCallback((id) => { setMemberDialog(null); setTaskDialog({ id }); setSearchOpen(false); setPanel('') }, [])
  const openMember = useCallback((id) => setMemberDialog({ id }), [])
  const openEntry = useCallback((entry) => { if (entry.kind === 'task') openTask(entry.recordId); else if (entry.kind === 'project') openProject(entry.recordId); else setEventDialog({ id: entry.recordId }) }, [openTask, openProject])
  const searchResults = useMemo(() => {
    if (!search.trim()) return []
    const term = search.toLowerCase()
    return [
      ...projects.filter((item) => item.name.toLowerCase().includes(term)).map((item) => ({ label: item.name, id: item.id, type: 'Project', page: 'dashboard' })),
      ...tasks.filter((item) => `${item.title} ${item.description || ''}`.toLowerCase().includes(term)).slice(0, 4).map((item) => ({ label: item.title, id: item.id, type: 'Task', page: 'tasks' })),
      ...team.filter((item) => item.name.toLowerCase().includes(term)).slice(0, 3).map((item) => ({ label: item.name, type: item.role, page: 'team' })),
      ...pages.filter((item) => item.label.toLowerCase().includes(term)).map((item) => ({ label: item.label, type: 'Page', page: item.id })),
    ].slice(0, 7)
  }, [search, projects, tasks, team])
  const saveProject = async (fields) => {
    const repositories = workspaceRepositories
    const initials = projectDialog.mode === 'create' && user ? user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2) : fields.initials
    const project = await repositories.projects.save({ ...fields, initials }, projectDialog.id)
    repositories.notifications.create({ title: projectDialog.mode === 'create' ? 'Project created' : 'Project updated', detail: project.name, projectId: project.id, read: false, initials }).catch(() => {})
    setProjectDialog(null)
  }
  const deleteProject = async (id) => { await workspaceRepositories.projects.remove(id); setProjectDialog(null) }
  const selectNotification = async (item) => {
    try {
      await workspaceRepositories.notifications.markRead(item.id)
      if (item.projectId && projects.some((p) => p.id === item.projectId)) openProject(item.projectId)
    } catch { /* The repository's error is displayed below the header. */ }
  }
  const pageTitle = page === 'admin' ? 'Administration' : pages.find((item) => item.id === page)?.label || 'Dashboard'
  const clearNotifications = () => { workspaceRepositories.notifications.markAllRead().catch(() => {}) }
  const renderModal = () => {
    if (!modal) return null
    if (modal === 'import') return <Modal title="Import your data" onClose={() => setModal('')}><form className="modal-form" onSubmit={async (e) => {
      e.preventDefault()
      const file = e.currentTarget.elements.file.files[0]
      if (!file) return
      try {
        const contents = await file.text()
        await workspaceRepositories.importCsv(contents)
        setModal('')
      } catch (error) {
        console.error('Unable to import CSV data', error)
        window.alert(error instanceof Error ? error.message : 'Unable to import this CSV file.')
      }
    }}><p>Bring your projects or tasks along. CSV files with a title or name column are supported.</p><label className="upload-drop"><Download size={22} /><strong>Choose a CSV file</strong><span>Projects or tasks · CSV format</span><input name="file" type="file" accept=".csv,text/csv" required /></label><button className="button button--primary modal-submit">Import data</button></form></Modal>
    return null
  }
  return <MotionConfig reducedMotion="user"><div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <AnimatePresence>{sidebarOpen && <motion.button className="mobile-scrim" aria-label="Close menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebarOpen(false)} />}</AnimatePresence>
    <Sidebar sidebarOpen={sidebarOpen} page={page} go={go} tasks={tasks} team={team} setModal={openModal} onClose={closeSidebar} />
    <div className="app-main" inert={sidebarOpen || undefined}><Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} page={page} pageTitle={pageTitle} search={search} setSearch={setSearch} searchOpen={searchOpen} setSearchOpen={setSearchOpen} searchResults={searchResults} go={go} panel={panel} setPanel={setPanel} notifications={notifications} clearNotifications={clearNotifications} onProject={openProject} onTask={openTask} onNotification={selectNotification} />
    {dataError && <p className="page-content" role="alert">Unable to save or load workspace data: {dataError.message}</p>}
    <main id="main" onClick={() => { if (searchOpen && !search) setSearchOpen(false) }}>
      {user && workspace.type === 'individual' && <AnonymousMigration />}
      <Suspense fallback={<div className="page-content" role="status">Loading workspace…</div>}><AnimatePresence mode="wait" initial={false}><motion.div key={page} className="route-content" variants={pageEntrance} initial="hidden" animate="visible" exit="exit">
        {page === 'dashboard' && <Dashboard projects={projects} tasks={tasks} events={eventState.data} team={team} timeEntries={timeState.data} onEntry={openEntry} onMember={openMember} onNavigate={go} onModal={openModal} onProject={openProject} />}
        {page === 'tasks' && <TaskBoard tasks={tasks} projects={projects} team={team} onOpen={openTask} onCreate={(status) => setTaskDialog({ status })} />}
        {page === 'projects' && <ProjectsPage projects={projects} tasks={tasks} onProject={openProject} onCreate={() => openModal('project')} />}
        {page === 'work-log' && <WorkLogPage entries={timeState.data} projects={projects} tasks={tasks} />}
        {page === 'calendar' && <CalendarPage events={eventState.data} tasks={tasks} projects={projects} onCreate={(date, timeZone) => setEventDialog({ date, timeZone })} onEntry={openEntry} />}
        {page === 'analytics' && <AnalyticsPage tasks={tasks} projects={projects} team={team} timeEntries={timeState.data} onProject={openProject} onTask={openTask} onMember={openMember} />}
        {page === 'team' && <TeamPage team={team} tasks={tasks} onMember={openMember} />}
        {page === 'settings' && <SettingsPage />}
        {page === 'help' && <HelpPage />}
        {page === 'admin' && user?.role === 'admin' && <AdminPage />}
      </motion.div></AnimatePresence></Suspense>
    </main>
    <footer className="app-footer"><span>Your Day, Your Way.</span><span>© 2026 Dayora</span></footer>
    </div>
    <AnimatePresence mode="wait">
      {eventDialog && <EventDialog key={eventDialog.id || 'new-event'} event={eventState.data.find((item) => item.id === eventDialog.id)} date={eventDialog.date} timeZone={eventDialog.timeZone} projects={projects} onClose={() => setEventDialog(null)} />}
      {memberDialog && <MemberDialog key={memberDialog.id || 'new-member'} member={team.find((item) => item.id === memberDialog.id)} team={team} tasks={tasks} onTask={openTask} onClose={() => setMemberDialog(null)} />}
      {taskDialog && <TaskDialog key={taskDialog.id || 'new-task'} task={tasks.find((item) => item.id === taskDialog.id)} status={taskDialog.status} projects={projects} team={team} onClose={() => setTaskDialog(null)} />}
      {renderModal()}
      {projectDialog && <ProjectDialog key={projectDialog.id || 'new-project'} mode={projectDialog.mode} project={projects.find((p) => p.id === projectDialog.id)} onClose={() => setProjectDialog(null)} onSave={saveProject} onDelete={deleteProject} />}
    </AnimatePresence>
  </div></MotionConfig>
}

export default App
