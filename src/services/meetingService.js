import { supabase } from './supabase.js'

const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
async function authHeaders({ workspaceId, contentType, filename } = {}) {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('Your Dayora session has expired. Please sign in again.')
  return {
    Authorization: 'Bearer ' + token,
    ...(contentType ? { 'Content-Type': contentType } : {}),
    ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
    ...(filename ? { 'X-Upload-Filename': filename } : {}),
  }
}
async function send(path, { method = 'GET', body, signal, workspaceId, upload } = {}) {
  const headers = await authHeaders({
    workspaceId,
    contentType: upload ? (upload.type || 'application/octet-stream') : (body !== undefined ? 'application/json' : undefined),
    filename: upload?.name,
  })
  const response = await fetch(base + '/api' + path, {
    method, credentials: 'include', signal, headers,
    ...(upload ? { body: upload } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.error?.message || 'Unable to contact Dayora. Please try again.')
    error.status = response.status
    error.code = result.error?.code
    throw error
  }
  return result
}
export function meetingApi(path, options = {}) { return send(path, options) }
export function uploadMeetingRecording(path, blob, options = {}) { return send(path, { ...options, method: 'POST', upload: blob }) }
