import { initializeApp } from 'firebase/app'
import { initializeAuth, inMemoryPersistence, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth'

let auth
export function firebaseAuth() {
  if (!auth) {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID, apiKey = import.meta.env.VITE_FIREBASE_API_KEY
    if (!projectId || !apiKey) throw new Error('Firebase public web configuration is missing. Configure the Dayora deployment environment.')
    auth = initializeAuth(initializeApp({ projectId, apiKey, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN }), { persistence: inMemoryPersistence })
    // Emulator configuration is explicit and separately guarded by the build configuration.
    if (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL, { disableWarnings: true })
  }
  return auth
}
const safeError = () => new Error('Unable to sign in. Check your credentials and email verification.')
export async function firebaseLogin({ email, password }) {
  const client = firebaseAuth()
  try { const result = await signInWithEmailAndPassword(client, email.trim(), password); return await result.user.getIdToken(true) }
  catch { throw safeError() }
  finally { await signOut(client) }
}
export async function firebaseSignup({ email, password, name }) {
  const client = firebaseAuth()
  if (password.length < 12 || password.length > 128) throw new Error('Use a password between 12 and 128 characters.')
  try { const result = await createUserWithEmailAndPassword(client, email.trim(), password); await updateProfile(result.user, { displayName: name.trim() }) }
  catch (error) { if (error.code !== 'auth/email-already-in-use') throw new Error('Unable to create this account. Check the fields or try again later.') }
  finally { await signOut(client) }
}
