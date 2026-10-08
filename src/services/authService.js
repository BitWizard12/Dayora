import { api, setCsrf } from './api.js'
import { firebaseLogin, firebaseSignup } from './firebaseAuth.js'
let generation = 0
const superseded = () => new DOMException('Session request superseded.', 'AbortError')
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('dayora-auth') : null
const notify = () => channel?.postMessage({ type: 'session-changed' })

export const authService = {
  subscribeChanges(listener) { const receive = (event) => { if (event.data?.type === 'session-changed') { generation++; listener() } }; channel?.addEventListener('message', receive); return () => channel?.removeEventListener('message', receive) },
  async session({ signal } = {}) { const current = generation; const result = await api('/auth/session', { signal }); if (current !== generation || signal?.aborted) throw superseded(); setCsrf(result.csrf); return result.user },
  async login(input) { const current = ++generation; const idToken = await firebaseLogin(input); if (current !== generation) throw superseded(); const result = await api('/auth/login', { method: 'POST', body: { idToken, remember: input.remember } }); if (current !== generation) throw superseded(); generation++; setCsrf(result.csrf); notify(); return result.user },
  async signup(input) { await firebaseSignup(input); await api('/auth/resend-verification', { method: 'POST', body: { email: input.email } }); return { message: 'If this email is available, a verification link has been sent. Check your email before signing in.' } },
  forgot: (email) => api('/auth/forgot-password', { method: 'POST', body: { email } }),
  resend: (email) => api('/auth/resend-verification', { method: 'POST', body: { email } }),
  verify: (token) => api('/auth/verify-email', { method: 'POST', body: { token } }),
  async reset(token, password) { generation++; const result = await api('/auth/reset-password', { method: 'POST', body: { token, password } }); generation++; setCsrf(); notify(); return result },
  async logout() { generation++; await api('/auth/logout', { method: 'POST' }); generation++; setCsrf(); notify() },
  logoutOthers: () => api('/auth/logout-others', { method: 'POST' }),
  async changePassword(input) { generation++; const result = await api('/auth/change-password', { method: 'POST', body: input }); generation++; setCsrf(); notify(); return result },
  async profile(input) { const result = await api('/auth/profile', { method: 'PATCH', body: input }); return result.user },
}
