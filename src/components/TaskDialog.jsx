import { useState } from 'react'
import Modal from './Modal'
import { workspaceRepositories as repos } from '../repositories/workspaceRepositories'
import { priorities, subtaskProgress, taskLabels } from '../services/tasks'
import { assignedMemberIds } from '../services/team'
import '../styles/tasks.css'
import useWorkspace from '../hooks/useWorkspace'
export default function TaskDialog({ task: current, projects, team = [], status = 'To do', onClose }) {
  const { workspace, members } = useWorkspace()
  const [initial] = useState(current)
  const task = current || initial
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [subtask, setSubtask] = useState('')
  const run = async (action, close = false) => { setBusy(true); setError(''); try { await action(); if (close) onClose() } catch (err) { setError(err.message) } finally { setBusy(false) } }
  return <Modal title={task ? 'Task details' : 'Create a task'} onClose={onClose}><form className="modal-form task-detail" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const fields = { ...Object.fromEntries(data), assigneeIds: data.getAll('assigneeIds'), ...(workspace.type === 'team' ? { accountAssigneeIds: data.getAll('accountAssigneeIds') } : {}) }; run(() => repos.tasks.saveTask(fields, task?.id), true) }}>
    <label>Task name<input name="title" defaultValue={task?.title || ''} required maxLength={200} data-initial-focus /></label>
    <label>Description<textarea name="description" defaultValue={task?.description || ''} rows={3} placeholder="Add context or acceptance criteria" /></label>
    <div className="form-row"><label>Stage<select name="status" defaultValue={task?.status || status}>{Object.entries(taskLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Priority<select name="priority" defaultValue={task?.priority || 'Medium'}>{priorities.map((value) => <option key={value}>{value}</option>)}</select></label></div>
    <div className="form-row"><label>Deadline<input type="date" name="dueDate" defaultValue={task?.dueDate || ''} /></label><label>Project<select name="projectId" defaultValue={task?.projectId || ''}><option value="">No project</option>{task?.projectId && !projects.some((item) => item.id === task.projectId) && <option value={task.projectId}>Deleted project (choose another)</option>}{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div>
    <label>Team<select name="team" defaultValue={task?.team || 'Frontend'}>{['Frontend', 'Backend', 'Design', 'Marketing'].map((team) => <option key={team}>{team}</option>)}</select></label>
    {workspace.type === 'team' && <fieldset className="assignment-field"><legend>Account members</legend>{members.map((member) => <label key={member.id}><input type="checkbox" name="accountAssigneeIds" value={member.id} defaultChecked={task?.accountAssigneeIds?.includes(member.id) || false} />{member.name}</label>)}</fieldset>}
    <fieldset className="assignment-field"><legend>Assigned members</legend>{team.map((member) => <label key={member.id}><input type="checkbox" name="assigneeIds" value={member.id} defaultChecked={task ? assignedMemberIds(task, team).includes(member.id) : false} />{member.name}</label>)}{!team.length && <p>Add workspace members on the Team page to assign tasks.</p>}</fieldset>
    {task && <section className="subtasks" aria-label="Subtasks"><div className="subtasks-heading"><strong>Subtasks</strong><span>{subtaskProgress(task)}% complete</span></div><progress aria-label="Subtask completion" value={subtaskProgress(task)} max="100" />{task.subtasks.map((item) => <div className="subtask-row" key={item.id}><label><input type="checkbox" checked={item.completed} disabled={busy} onChange={(event) => run(() => repos.tasks.changeSubtask(task.id, item.id, event.target.checked))} /><span>{item.title}</span></label><button type="button" className="icon-btn" disabled={busy} aria-label={`Delete subtask ${item.title}`} onClick={() => run(() => repos.tasks.changeSubtask(task.id, item.id, null))}>×</button></div>)}<div className="subtask-add"><input aria-label="New subtask" value={subtask} onChange={(event) => setSubtask(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); run(async () => { await repos.tasks.addSubtask(task.id, subtask); setSubtask('') }) } }} placeholder="Break it into smaller steps" /><button type="button" className="button button--outline" disabled={busy || !subtask.trim()} onClick={() => run(async () => { await repos.tasks.addSubtask(task.id, subtask); setSubtask('') })}>Add subtask</button></div></section>}
    {error && <p role="alert">{error}</p>}
    {confirm ? <div className="delete-confirm"><p>Delete this task and its subtasks permanently?</p><button type="button" className="button button--outline" disabled={busy} onClick={() => setConfirm(false)}>Keep task</button><button type="button" className="button button--danger" disabled={busy} onClick={() => run(() => repos.tasks.remove(task.id), true)}>Delete task</button></div> : task && <div className="task-detail-actions"><button type="button" className="button button--outline" disabled={busy} onClick={() => setConfirm(true)}>Delete</button><button type="button" className="button button--outline" disabled={busy} onClick={() => run(() => repos.tasks.move(task.id, task.status === 'Done' ? 'To do' : 'Done'), true)}>{task.status === 'Done' ? 'Reopen task' : 'Complete task'}</button></div>}
    <div className="modal-actions"><button type="button" className="button button--outline" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={busy}>{busy ? 'Saving…' : task ? 'Save changes' : 'Create task'}</button></div>
  </form></Modal>
}
