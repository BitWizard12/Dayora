import { api } from './api.js'
export const adminService = {
  overview: () => api('/admin/overview'),
  users: (search = '', page = 1) => api(`/admin/users?search=${encodeURIComponent(search)}&page=${page}`),
  audit: (page = 1) => api(`/admin/audit?page=${page}`),
  update: (id, input) => api(`/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
}
