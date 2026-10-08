import { useState } from 'react'
import Modal from './Modal'
import { workspaceRepositories as repos } from '../repositories/workspaceRepositories'
import { dateInZone, defaultTimeZone } from '../services/calendar'

export default function EventDialog({ event: current, date, timeZone = defaultTimeZone, projects, onClose }) {
  const [initial] = useState(current)
  const event = current || initial
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const [allDay, setAllDay] = useState(event ? !event.time : false)
  const run = async (command) => { setBusy(true); setError(''); try { await command(); onClose() } catch (err) { setError(err.message) } finally { setBusy(false) } }
  return <Modal title={event ? 'Event details' : 'Add to your calendar'} onClose={onClose}><form className="modal-form phase4-detail" onSubmit={(e) => { e.preventDefault(); const fields = Object.fromEntries(new FormData(e.currentTarget)); run(() => repos.events.saveEvent({ ...fields, time: allDay ? '' : fields.time }, event?.id)) }}>
    <label>Event name<input name="title" required maxLength={200} defaultValue={event?.title || ''} data-initial-focus /></label>
    <label>Description<textarea name="description" rows={3} defaultValue={event?.description || ''} placeholder="Agenda, location, or a meeting link" /></label>
    <label className="checkbox-label"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />All-day event</label>
    <div className="form-row"><label>Date<input name="date" type="date" required defaultValue={event?.date || date || dateInZone()} /></label><label>Time<input name="time" type="time" disabled={allDay} required={!allDay} defaultValue={event?.time || '14:00'} /></label></div>
    <div className="form-row"><label>Timezone<input name="timeZone" list="dayora-timezones" required defaultValue={event?.timeZone || timeZone} /><datalist id="dayora-timezones">{[defaultTimeZone, 'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney'].map((zone) => <option key={zone} value={zone} />)}</datalist></label><label>Duration (minutes)<input name="durationMinutes" type="number" min="1" max="10080" disabled={allDay} defaultValue={event?.durationMinutes || 60} /></label></div>
    <label>Repeated clock hour<select name="dstChoice" defaultValue={event?.dstChoice || 'reject'}><option value="reject">Ask me if the time is ambiguous</option><option value="earlier">Earlier occurrence</option><option value="later">Later occurrence</option></select></label>
    <label>Project<select name="projectId" defaultValue={event?.projectId || ''}><option value="">No project</option>{event?.projectId && !projects.some((project) => project.id === event.projectId) && <option value={event.projectId}>Deleted project (choose another)</option>}{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    <label>Color<select name="color" defaultValue={event?.color || 'sage'}>{['sage', 'blue', 'peach', 'lilac', 'yellow'].map((color) => <option key={color}>{color}</option>)}</select></label>
    {error && <p role="alert">{error}</p>}{confirm && <div className="delete-confirm"><p>Delete this event permanently?</p><button className="button button--outline" type="button" onClick={() => setConfirm(false)}>Keep event</button><button className="button button--danger" type="button" disabled={busy} onClick={() => run(() => repos.events.remove(event.id))}>Delete event</button></div>}
    <div className="modal-actions">{event && !confirm && <button className="button button--outline" type="button" disabled={busy} onClick={() => setConfirm(true)}>Delete</button>}<button className="button button--outline" type="button" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={busy}>{busy ? 'Saving…' : event ? 'Save changes' : 'Add event'}</button></div>
  </form></Modal>
}
