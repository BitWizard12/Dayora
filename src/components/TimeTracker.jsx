import { memo, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Clock3, Pause, Play, Square } from 'lucide-react'
import useRepository from '../hooks/useRepository'
import { workspaceRepositories } from '../repositories/workspaceRepositories'
import { elapsed, formatDuration, trackedToday } from '../utils/timer'
import { cardEntrance } from '../styles/motion'

function TimeTracker({ projects }) {
  const snapshot = useRepository(workspaceRepositories.timeEntries)
  const tracker = useMemo(() => workspaceRepositories.timeEntries.view(snapshot.data), [snapshot.data])
  const [pending, setPending] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [now, setNow] = useState(() => Date.now())
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
    try { await workspaceRepositories.timeEntries.act(action, timestamp, projects.find((p) => p.id === projectId)) }
    catch { /* The repository error is displayed in the widget. */ }
    finally { setPending(false) }
  }
  return <motion.article className="time-tracker" variants={cardEntrance}>
    <div className="timer-heading"><h2><Clock3 size={17} /> Time tracker</h2><AnimatePresence mode="wait"><motion.span key={state} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="timer-state" aria-live="polite">{state}</motion.span></AnimatePresence></div>
    {tracker.active ? <p className="timer-project">{tracker.active.label}</p> : <label className="timer-project-select">Working on<select aria-label="Project to track" value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Focus session</option>{projects.filter((p) => p.status !== 'Completed').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    <div className="timer-digits" role="timer" aria-label="Current session elapsed time">{formatDuration(elapsed(tracker.active, now)).split('').map((digit, index) => <span key={index} className="timer-digit"><motion.span key={digit} initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>{digit}</motion.span></span>)}</div>
    <div className="timer-controls">{state === 'Ready' ? <button className="timer-start" disabled={pending || snapshot.status !== 'ready'} onClick={() => act('start')}><Play size={16} /> Start tracking</button> : <><button className="timer-start" disabled={pending || snapshot.status !== 'ready'} onClick={() => act(state === 'Paused' ? 'resume' : 'pause')}>{state === 'Paused' ? <Play size={16} /> : <Pause size={16} />}{state === 'Paused' ? 'Resume' : 'Pause'}</button><button className="timer-stop" disabled={pending} onClick={() => act('stop')}><Square size={14} /> Stop & save</button></>}</div>
    {snapshot.error && <p role="alert">Unable to save tracked time: {snapshot.error.message}</p>}<div className="timer-total"><span>Tracked today <small>IST</small></span><strong data-testid="today-total">{formatDuration(trackedToday(tracker, now))}</strong></div>
    <details className="timer-history"><summary>Saved sessions ({tracker.sessions.length})</summary>{tracker.sessions.length ? <ul>{tracker.sessions.slice(-5).reverse().map((s) => <li key={s.id}><span>{s.label}<small>{new Date(s.endedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></span><strong>{formatDuration(s.duration)}</strong></li>)}</ul> : <p>Stop a session to save your tracked time.</p>}</details>
  </motion.article>
}

export default memo(TimeTracker)
