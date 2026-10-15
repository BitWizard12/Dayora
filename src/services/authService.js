import { api, setCsrf } from './api.js'
import { firebaseGoogleLogin } from './firebaseAuth.js'
let generation = 0
const superseded = () => new DOMException('Session request superseded.', 'AbortError')
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('dayora-auth') : null
const notify = () => channel?.postMessage({ type: 'session-changed' })

export const authService = {
  subscribeChanges(listener) { const receive = (event) => { if (event.data?.type === 'session-changed') { generation++; listener() } }; channel?.addEventListener('message', receive); return () => channel?.removeEventListener('message', receive) },
  async session({ signal } = {}) { const current = generation; const result = await api('/auth/session', { signal }); if (current !== generation || signal?.aborted) throw superseded(); setCsrf(result.csrf); return result.user },
  async loginWithGoogle() {
    const current = ++generation
    const idToken = await firebaseGoogleLogin()
    if (current !== generation) throw superseded()
    const result = await api('/auth/login', { method: 'POST', body: { idToken, remember: true } })
    if (current !== generation) throw superseded()
    generation++; setCsrf(result.csrf); notify()
    return result.user
  },
  async logout() { generation++; await api('/auth/logout', { method: 'POST' }); generation++; setCsrf(); notify() },
  logoutOthers: () => api('/auth/logout-others', { method: 'POST' }),
  async profile(input) { const result = await api('/auth/profile', { method: 'PATCH', body: input }); return result.user },
}
