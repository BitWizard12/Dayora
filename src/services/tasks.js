export const taskLabels = { 'To do': 'To Do', 'In progress': 'In Progress', 'In review': 'In Review', Done: 'Completed' }
export const priorities = ['Low', 'Medium', 'High', 'Urgent']
export const todayDate = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
export const subtaskProgress = (task) => task.subtasks?.length ? Math.round(task.subtasks.filter((item) => item.completed).length / task.subtasks.length * 100) : 0
export function filterTasks(tasks, filters, today = todayDate()) {
  return tasks.filter((task) => {
    const done = task.status === 'Done'
    const due = task.dueDate
    const view = filters.view || 'All'
    return (!filters.search || `${task.title} ${task.description || ''} ${(task.subtasks || []).map((item) => item.title).join(' ')}`.toLowerCase().includes(filters.search.toLowerCase())) &&
      (!filters.status || task.status === filters.status) && (!filters.priority || task.priority === filters.priority) &&
      (!filters.project || (filters.project === 'none' ? !task.projectId : task.projectId === filters.project)) &&
      (!filters.deadline || (filters.deadline === 'none' ? !due : due === filters.deadline)) &&
      (view === 'All' || (view === 'Completed' ? done : !done && (view === 'Today' ? due === today : view === 'Overdue' ? due && due < today : due && due > today)))
  }).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}
export function taskInput(input) {
  const title = String(input.title || '').trim()
  if (!title) throw new Error('A task name is required.')
  if (!Object.hasOwn(taskLabels, input.status)) throw new Error('Invalid task status.')
  if (!priorities.includes(input.priority)) throw new Error('Invalid task priority.')
  if (input.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || new Date(`${input.dueDate}T12:00:00Z`).toISOString().slice(0, 10) !== input.dueDate)) throw new Error('Invalid deadline.')
  return { title, description: String(input.description || ''), status: input.status, priority: input.priority,
    dueDate: input.dueDate || null, due: input.dueDate || 'No deadline', projectId: input.projectId || null, team: input.team || 'Frontend' }
}
