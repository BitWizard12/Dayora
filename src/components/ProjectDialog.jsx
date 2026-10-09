import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import Modal from './Modal'
import { formatDeadline, projectStatuses } from '../utils/projects'
import useWorkspace from '../hooks/useWorkspace'

export default function ProjectDialog({ project: currentProject, mode, onClose, onSave, onDelete }) {
  const { canManage } = useWorkspace()
  // Keep details available while an async deletion commits and the dialog exits.
  const [initialProject] = useState(currentProject)
  const project = currentProject || initialProject
  const [editing, setEditing] = useState(mode === 'create')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = data.get('name').trim()
    if (!name) { setError('Enter a project name.'); return }
    setPending(true)
    try {
      await onSave({ name, description: data.get('description').trim(), status: data.get('status'), deadline: data.get('deadline'),
        initials: project?.initials || 'NC', color: project?.color || 'sage' })
    } catch (error) { setError(error.message) }
    finally { setPending(false) }
  }
  const remove = async () => {
    setPending(true)
    try { await onDelete(project.id) } catch (error) { setError(error.message) }
    finally { setPending(false) }
  }
  return <Modal title={editing ? project ? 'Edit project' : 'Create project' : project.name} onClose={onClose}>
    {editing ? <form className="modal-form" onSubmit={submit}>
      <label>Project name<input name="name" defaultValue={project?.name || ''} placeholder="Give your project a name" maxLength={100} required data-initial-focus /></label>
      <label>Description<textarea name="description" defaultValue={project?.description || ''} placeholder="What are you working towards?" rows={3} maxLength={2000} /></label>
      <div className="form-row"><label>Status<select name="status" defaultValue={project?.status || 'Pending'}>{projectStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><label>Deadline<input type="date" name="deadline" defaultValue={project?.deadline || ''} required /></label></div>
      {error && <p role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button button--outline" onClick={onClose}>Cancel</button><button className="button button--primary" type="submit" disabled={pending}>{project ? 'Save changes' : 'Create project'}</button></div>
    </form> : <div className="project-details">{error && <p role="alert">{error}</p>}<span className="project-status">{project.status}</span><p>{project.description || 'No description yet. Edit this project to add one.'}</p><dl><div><dt>Deadline</dt><dd>{formatDeadline(project.deadline)}</dd></div></dl>
      {canManage && (confirmDelete ? <div className="project-delete-confirm"><p>Delete {project.name}? Saved time sessions will be kept.</p><button className="button button--outline" onClick={() => setConfirmDelete(false)}>Keep project</button><button className="button button--danger" disabled={pending} onClick={remove}>Delete project</button></div> : <div className="modal-actions"><button className="button button--outline" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Delete</button><button className="button button--primary" onClick={() => setEditing(true)}><Pencil size={15} /> Edit project</button></div>)}
    </div>}
  </Modal>
}
