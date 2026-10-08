export function photoUrl(photo = '') {
  return /^media:[0-9a-f-]{36}$/.test(photo) ? `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api/media/${photo.slice(6)}` : photo
}
