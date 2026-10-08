const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
let csrfToken = ''
let credentialVersion = 0
export function setCsrf(value = '') { if (value !== csrfToken) credentialVersion++; csrfToken = value }
export async function api(path, { method = 'GET', body, signal } = {}) {
  const requestVersion = credentialVersion
  const mutation = !['GET', 'HEAD'].includes(method)
  const payload = body === undefined && mutation ? {} : body
  const response = await fetch(`${base}/api${path}`, { method, credentials: 'include', signal,
    headers: { ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(csrfToken && mutation ? { 'X-CSRF-Token': csrfToken } : {}) },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.error?.message || 'Unable to contact Dayora. Please try again.')
    error.status = response.status; error.code = result.error?.code
    if (response.status === 401 && requestVersion === credentialVersion && !path.startsWith('/auth/')) window.dispatchEvent(new Event('dayora-session-expired'))
    throw error
  }
  return result
}
