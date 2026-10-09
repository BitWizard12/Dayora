import { useState } from 'react'
import Modal from './Modal'
import { workspaceRepositories } from '../repositories/workspaceRepositories'

export default function WorkLogDialog({ entry, projects, tasks, onClose }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <Modal title="What did you work on?" onClose={onClose}><form className="modal-form" onSubmit={async (event) => {
    event.preventDefault(); const fields = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true); setError('')
    try { await workspaceRepositories.timeEntries.saveDetails(entry.id, fields); onClose() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }}><label>Activity title<input name="title" maxLength={200} defaultValue={entry.title || ''} placeholder="A little progress, in your own words" data-initial-focus /></label>
    <label>What I did<textarea name="note" rows={5} maxLength={10000} defaultValue={entry.note || ''} placeholder="What did you complete, explore, or learn?" /></label>
    <div className="form-row"><label>Project<select name="projectId" defaultValue={entry.projectId || ''}><option value="">No project</option>{entry.projectId && !projects.some((project) => project.id === entry.projectId) && <option value={entry.projectId}>Archived project</option>}{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    <label>Task<select name="taskId" defaultValue={entry.taskId || ''}><option value="">No task</option>{entry.taskId && !tasks.some((task) => task.id === entry.taskId) && <option value={entry.taskId}>Archived task</option>}{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label></div>
    {error && <p role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button button--outline" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={busy}>{busy ? 'Saving…' : 'Save work log'}</button></div>
  </form></Modal>
}
