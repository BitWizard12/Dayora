import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Clock3, Pause, Play, Square } from 'lucide-react'
import useRepository from '../hooks/useRepository'
import { workspaceRepositories } from '../repositories/workspaceRepositories'
import { elapsed, formatDuration, trackedToday } from '../utils/timer'
import { cardEntrance } from '../styles/motion'
import WorkLogDialog from './WorkLogDialog'

function TimeTracker({ projects, tasks: suppliedTasks }) {
  const snapshot = useRepository(workspaceRepositories.timeEntries)
  const taskSnapshot = useRepository(workspaceRepositories.tasks)
  const tasks = suppliedTasks || taskSnapshot.data
  const tracker = useMemo(() => workspaceRepositories.timeEntries.view(snapshot.data), [snapshot.data])
  const [pending, setPending] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [draft, setDraft] = useState({ sessionId: null, title: '', note: '', taskId: '' })
  const [savedEntry, setSavedEntry] = useState(null)
  const activeId = tracker.active?.id || null
  const repositories = workspaceRepositories
  const draftToSave = useRef(null)
  useEffect(() => {
    draftToSave.current = activeId && draft.sessionId === activeId ? { id: activeId, fields: draft } : null
    if (!draftToSave.current) return
    const timeout = setTimeout(() => repositories.timeEntries.saveDetails(activeId, draft).catch(() => {}), 650)
    return () => clearTimeout(timeout)
  }, [repositories, activeId, draft])
  useEffect(() => {
    const holder = draftToSave
    return () => { const pending = holder.current; if (pending) repositories.timeEntries.saveDetails(pending.id, pending.fields).catch(() => {}) }
  }, [repositories])
  useEffect(() => repositories.registerDraftFlusher(() => {
    if (!activeId) return Promise.resolve()
    const current = repositories.timeEntries.getSnapshot().data.find((entry) => entry.id === activeId)
    return repositories.timeEntries.saveDetails(activeId, draft.sessionId === activeId ? draft : { title: current?.title, note: current?.note, taskId: current?.taskId })
  }), [repositories, activeId, draft])
  const details = draft.sessionId === activeId ? draft : { title: tracker.active?.title || '', note: tracker.active?.note || '', taskId: tracker.active?.taskId || '' }
  const setDetails = (next) => setDraft({ ...next, sessionId: activeId })
  const reduced = useReducedMotion()
  const state = tracker.active ? tracker.active.runningSince === null ? 'Paused' : 'Tracking' : 'Ready'
  const running = state === 'Tracking'
  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const interval = setInterval(refresh, running ? 250 : 60000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [running])
  const act = async (action) => {
    const timestamp = Date.now()
    setNow(timestamp)
    setPending(true)
    try {
      const next = await workspaceRepositories.timeEntries.act(action, timestamp, projects.find((p) => p.id === projectId), details)
      if (action === 'stop') { setSavedEntry(next.find((entry) => entry.id === activeId)); setDetails({ title: '', note: '', taskId: '' }) }
    }
    catch { /* The repository error is displayed in the widget. */ }
    finally { setPending(false) }
  }
  const saveNote = async () => {
    if (!activeId || pending) return
    setPending(true)
    try { await workspaceRepositories.timeEntries.saveDetails(activeId, details) } catch { /* Repository errors appear below. */ } finally { setPending(false) }
  }
  return <motion.article className="time-tracker" variants={cardEntrance}>
    <div className="timer-heading"><h2><Clock3 size={17} /> Time tracker</h2><AnimatePresence mode="wait"><motion.span key={state} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="timer-state" aria-live="polite">{state}</motion.span></AnimatePresence></div>
    {tracker.active ? <p className="timer-project">{tracker.active.label}</p> : <label className="timer-project-select">Working on<select aria-label="Project to track" value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Focus session</option>{projects.filter((p) => p.status !== 'Completed').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    <div className="timer-notes"><label>Activity title<input aria-label="Timer activity title" maxLength={200} value={details.title} placeholder="What are you focusing on?" onChange={(event) => setDetails({ ...details, title: event.target.value })} /></label>
      <label>Task<select aria-label="Task to track" value={details.taskId} onChange={(event) => { const task = tasks.find((item) => item.id === event.target.value); setDetails({ ...details, taskId: event.target.value }); if (!tracker.active && task?.projectId) setProjectId(task.projectId) }}><option value="">No task</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
      <label>What I did<textarea aria-label="Timer work note" rows={2} maxLength={10000} value={details.note} placeholder="A few words about your progress…" onChange={(event) => setDetails({ ...details, note: event.target.value })} /></label>
      {tracker.active && <button className="timer-save-note" disabled={pending} onClick={saveNote}>Save session note</button>}
    </div>
    <div className="timer-digits" role="timer" aria-label="Current session elapsed time">{formatDuration(elapsed(tracker.active, now)).split('').map((digit, index) => <span key={index} className="timer-digit"><motion.span key={digit} initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>{digit}</motion.span></span>)}</div>
    <div className="timer-controls">{state === 'Ready' ? <button className="timer-start" disabled={pending || snapshot.status !== 'ready'} onClick={() => act('start')}><Play size={16} /> Start tracking</button> : <><button className="timer-start" disabled={pending || snapshot.status !== 'ready'} onClick={() => act(state === 'Paused' ? 'resume' : 'pause')}>{state === 'Paused' ? <Play size={16} /> : <Pause size={16} />}{state === 'Paused' ? 'Resume' : 'Pause'}</button><button className="timer-stop" disabled={pending} onClick={() => act('stop')}><Square size={14} /> Stop & save</button></>}</div>
    {snapshot.error && <p role="alert">Unable to save tracked time: {snapshot.error.message}</p>}<div className="timer-total"><span>Tracked today <small>IST</small></span><strong data-testid="today-total">{formatDuration(trackedToday(tracker, now))}</strong></div>
    <details className="timer-history"><summary>Saved sessions ({tracker.sessions.length})</summary>{tracker.sessions.length ? <ul>{tracker.sessions.slice(-5).reverse().map((s) => <li key={s.id}><span>{s.label}<small>{new Date(s.endedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></span><strong>{formatDuration(s.duration)}</strong></li>)}</ul> : <p>Stop a session to save your tracked time.</p>}</details>
    {savedEntry && <WorkLogDialog entry={savedEntry} projects={projects} tasks={tasks} onClose={() => setSavedEntry(null)} />}
  </motion.article>
}

export default memo(TimeTracker)
