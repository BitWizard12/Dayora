export const projectStatuses = ['Pending', 'In progress', 'Completed']

export function normalizeProjects(items) {
  if (!Array.isArray(items)) return []
  return items.filter((item) => item && typeof item.name === 'string').map((item, index) => {
    const date = item.deadline || item.due
    const parsed = date ? new Date(date) : null
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date
      : parsed && !Number.isNaN(parsed.getTime()) ? `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}` : ''
    return { ...item, id: item.id || `legacy-project-${index}`, description: item.description || '',
      status: projectStatuses.includes(item.status) ? item.status : 'In progress', deadline }
  })
}

export function projectMetrics(projects) {
  return { total: projects.length, completed: projects.filter((p) => p.status === 'Completed').length,
    running: projects.filter((p) => p.status === 'In progress').length,
    pending: projects.filter((p) => p.status === 'Pending').length }
}

export function formatDeadline(deadline) {
  return deadline ? new Date(`${deadline}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No deadline'
}
