import { useCallback, useEffect, useRef, useState } from 'react'
import { NotebookPen, Check } from 'lucide-react'
import { workspaceRepositories } from '../repositories/workspaceRepositories'
import useRepository from '../hooks/useRepository'
import { logDate } from '../services/workLog'
import useNow from '../hooks/useNow'
import useWorkspace from '../hooks/useWorkspace'

export default function DailyNote() {
  const { workspace } = useWorkspace()
  const repositories = workspaceRepositories, repo = repositories.dailyNotes
  const snapshot = useRepository(repo), today = logDate(useNow())
  const saved = repo.forDate(snapshot.data, today)
  const [draft, setDraft] = useState(null), [status, setStatus] = useState(''), [error, setError] = useState('')
  const pending = useRef(null), timeout = useRef(null), alive = useRef(true)
  const inFlight = useRef(Promise.resolve())
  const flush = useCallback(() => {
    clearTimeout(timeout.current)
    const next = pending.current
    if (!next) return inFlight.current
    pending.current = null
    if (alive.current) setStatus('Saving…')
    inFlight.current = repo.save(next.date, next.note).then(() => { if (alive.current) { setStatus('Saved'); setError('') } }).catch((err) => { if (alive.current) { pending.current ||= next; setStatus('Not saved'); setError(err.message) } throw err })
    return inFlight.current
  }, [repo])
  const flushRef = useRef(flush)
  useEffect(() => { flushRef.current = flush }, [flush])
  useEffect(() => repositories.registerDraftFlusher(flush), [repositories, flush])
  useEffect(() => {
    alive.current = true
    return () => { flushRef.current().catch(() => {}); alive.current = false; clearTimeout(timeout.current) }
  }, [repo])
  const value = draft?.date === today ? draft.note : saved?.note || ''
  return <article className="panel daily-note"><div className="panel-heading"><div><h2><NotebookPen size={20} /> Today’s note</h2><p>{today} · Your thoughts, one day at a time.</p></div><span className="save-indicator" role="status">{status === 'Saved' && <Check size={15} />}{status}</span></div>
    <label className="sr-only" htmlFor="daily-note">Today’s note</label><textarea id="daily-note" rows={5} maxLength={10000} disabled={snapshot.status !== 'ready'} placeholder="What moved forward? What’s on your mind? What will you continue tomorrow?" value={value} onBlur={() => flush().catch(() => {})} onChange={(event) => { const note = event.target.value; setDraft({ date: today, note }); pending.current = { date: today, note }; setStatus('Unsaved'); clearTimeout(timeout.current); timeout.current = setTimeout(() => flush().catch(() => {}), 650) }} />
    <p className="daily-note-caption">{workspace.type === 'individual' ? 'Saved in your personal space.' : 'This note is shared with your team. Only you can edit it.'}</p>
    {(error || snapshot.error) && <p role="alert">{error || snapshot.error.message}<button className="text-link" onClick={() => flush().catch(() => {})}>Retry saving</button></p>}
  </article>
}
