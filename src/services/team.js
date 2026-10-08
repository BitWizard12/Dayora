export const departments = ['Product', 'Design', 'Engineering', 'Marketing', 'Operations']
export const inferDepartment = (role = '') => /design/i.test(role) ? 'Design' : /engineer|develop|backend|frontend/i.test(role) ? 'Engineering' : /marketing/i.test(role) ? 'Marketing' : /product/i.test(role) ? 'Product' : 'Operations'
export function assignedMemberIds(task, team) {
  if (task.assigneeIds?.length) return task.assigneeIds.filter((id) => team.some((member) => member.id === id))
  return team.filter((member) => task.assignees?.includes(member.initials) && team.filter((other) => other.initials === member.initials).length === 1).map((member) => member.id)
}
export function taskAssignees(task, team) {
  if (task.assigneeIds?.length) return task.assigneeIds.map((id) => team.find((member) => member.id === id)).filter(Boolean)
  return (task.assignees || []).map((initials, index) => {
    const matches = team.filter((member) => member.initials === initials)
    return matches.length === 1 ? matches[0] : { id: `legacy-avatar:${index}`, initials }
  })
}
export function teamWorkload(tasks, team) {
  return team.map((member) => {
    const assigned = tasks.filter((task) => assignedMemberIds(task, team).includes(member.id))
    const completed = assigned.filter((task) => task.status === 'Done').length
    return { ...member, total: assigned.length, completed, pending: assigned.length - completed, progress: assigned.length ? Math.round(completed / assigned.length * 100) : 0 }
  })
}
export function memberInput(input) {
  const name = String(input.name || '').trim(), email = String(input.email || '').trim().toLowerCase(), role = String(input.role || '').trim()
  if (!name || !role) throw new Error('A name and role are required.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email address is required.')
  const department = input.department || inferDepartment(role)
  if (!departments.includes(department)) throw new Error('Choose a valid department.')
  const photo = input.photo || ''
  if (photo && !/^media:[0-9a-f-]{36}$/.test(photo) && (!/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(photo) || photo.length > 2800000)) throw new Error('Use a PNG, JPEG, WebP or GIF picture smaller than 2 MB.')
  return { name, email, role, department, photo, initials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), color: input.color || 'sage' }
}
export function readMemberPhoto(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 2 * 1024 * 1024) return Promise.reject(new Error('Use a PNG, JPEG, WebP or GIF picture smaller than 2 MB.'))
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Unable to read this picture.')); reader.readAsDataURL(file) })
}
export const completionFields = (previous, status, now = Date.now()) => ({ status, completedAt: status === 'Done' ? previous?.status === 'Done' ? previous.completedAt ?? null : now : null })
