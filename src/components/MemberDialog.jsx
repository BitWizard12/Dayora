import { useMemo, useState } from 'react'
import Modal from './Modal'
import Avatar from './Avatar'
import { workspaceRepositories as repos } from '../repositories/workspaceRepositories'
import { assignedMemberIds, departments, readMemberPhoto, teamWorkload } from '../services/team'
import useWorkspace from '../hooks/useWorkspace'
import useAuth from '../hooks/useAuth'

export default function MemberDialog({ member: current, team, tasks, onTask, onClose }) {
  const { canManage } = useWorkspace()
  const { user } = useAuth()
  const [initial] = useState(current), [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const member = current || initial
  const [photo, setPhoto] = useState(member?.photo || '')
  const [assignId, setAssignId] = useState('')
  const workload = useMemo(() => teamWorkload(tasks, team).find((item) => item.id === member?.id), [tasks, team, member?.id])
  const assigned = tasks.filter((task) => assignedMemberIds(task, team).includes(member?.id))
  const run = async (command, close = false) => { setBusy(true); setError(''); try { await command(); if (close) onClose() } catch (err) { setError(err.message) } finally { setBusy(false) } }
  return <Modal title={member ? 'Team member details' : 'Add team member'} onClose={onClose}><form className="modal-form phase4-detail" onSubmit={(e) => { e.preventDefault(); const fields = Object.fromEntries(new FormData(e.currentTarget)); run(() => repos.team.saveMember({ ...fields, photo, color: member?.color || 'sage' }, member?.id), true) }}>
    <div className="member-profile"><Avatar initials={member?.initials || 'TM'} color={member?.color} photo={photo} /><div><strong>{member?.name || 'A new face for your workspace'}</strong><p>Workspace member · No account access</p></div></div>
    <fieldset className="contact-fields" disabled={!canManage}>
    <label>Profile picture<input type="file" disabled={user?.photoUploadsEnabled === false} accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { const file = e.target.files[0]; if (file) run(async () => setPhoto(await readMemberPhoto(file))) }} /></label>{photo && <button type="button" className="text-link" onClick={() => setPhoto('')}>Remove picture</button>}
    {user?.photoUploadsEnabled === false && <p>Photo uploads are unavailable. Contact details can still be saved.</p>}
    <label>Full name<input name="name" required maxLength={120} defaultValue={member?.name || ''} data-initial-focus /></label><label>Email address<input name="email" type="email" required defaultValue={member?.email || ''} /></label>
    <div className="form-row"><label>Role<input name="role" required defaultValue={member?.role || ''} /></label><label>Department<select name="department" defaultValue={member?.department || 'Product'}>{departments.map((department) => <option key={department}>{department}</option>)}</select></label></div>
    </fieldset>
    {member && <section className="member-tasks" aria-label="Member workload"><h3>{workload?.total || 0} assigned · {workload?.completed || 0} completed</h3><progress aria-label="Member task completion" value={workload?.progress || 0} max="100" />{assigned.map((task) => <div key={task.id} className="member-task-row"><button type="button" className="text-link" onClick={() => onTask(task.id)}>{task.title}</button><button type="button" className="icon-btn" disabled={busy} aria-label={`Unassign ${task.title}`} onClick={() => run(() => repos.tasks.assign(task.id, assignedMemberIds(task, team).filter((id) => id !== member.id)))}>×</button></div>)}
      <div className="subtask-add"><select aria-label="Task to assign" value={assignId} onChange={(e) => setAssignId(e.target.value)}><option value="">Choose a task</option>{tasks.filter((task) => !assigned.some((item) => item.id === task.id)).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select><button type="button" className="button button--outline" disabled={busy || !assignId} onClick={() => run(async () => { const task = tasks.find((item) => item.id === assignId); await repos.tasks.assign(assignId, [...assignedMemberIds(task, team), member.id]); setAssignId('') })}>Assign task</button></div>
    </section>}
    {error && <p role="alert">{error}</p>}{confirm && <div className="delete-confirm"><p>Remove this member? Their tasks will remain and be unassigned from this member.</p><button className="button button--outline" type="button" onClick={() => setConfirm(false)}>Keep member</button><button className="button button--danger" type="button" disabled={busy} onClick={() => run(() => repos.team.removeMember(member.id), true)}>Remove member</button></div>}
    <div className="modal-actions">{canManage && member && !confirm && <button className="button button--outline" type="button" disabled={busy} onClick={() => setConfirm(true)}>Remove</button>}<button className="button button--outline" type="button" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={busy || !canManage}>{busy ? 'Saving…' : member ? 'Save changes' : 'Add member'}</button></div>
  </form></Modal>
}
