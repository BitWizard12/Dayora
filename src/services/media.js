let workspaceId = ''
export function setMediaWorkspace(id = '') { workspaceId = id }
export function photoUrl(photo = '') {
  return /^media:[0-9a-f-]{36}$/.test(photo) ? `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api/media/${photo.slice(6)}${workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : ''}` : photo
}

// Credentialed CORS fetch keeps private images usable across Vercel/Render
// without relaxing the server's same-site resource policy or publishing URLs.
export async function loadPrivatePhoto(url, { signal, fetcher = fetch } = {}) {
  const response = await fetcher(url, { credentials: 'include', mode: 'cors', signal })
  if (!response.ok || !/^image\/(png|jpeg|webp|gif)(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Photo unavailable.')
  const blob = await response.blob()
  if (blob.size > 2 * 1024 * 1024) throw new Error('Photo unavailable.')
  return blob
}
