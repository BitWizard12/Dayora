import { initializeApp } from 'firebase/app'
import { getAuth, inMemoryPersistence, setPersistence, connectAuthEmulator, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

let auth
export function firebaseAuth() {
  if (!auth) {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
    if (!projectId || !apiKey) throw new Error('Firebase public web configuration is missing. Configure the Dayora deployment environment.')
    const authDomain = `${projectId}.firebaseapp.com`

    const app = initializeApp({ projectId, apiKey, authDomain })
    auth = getAuth(app)
    setPersistence(auth, inMemoryPersistence).catch(() => {})

    if (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) {
      connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL, { disableWarnings: true })
    }
  }
  return auth
}

export async function firebaseGoogleLogin() {
  const client = firebaseAuth()
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })

  try {
    const result = await signInWithPopup(client, provider)
    return await result.user.getIdToken(true)
  } catch (error) {
    if (error?.code === 'auth/popup-closed-by-user') throw new Error('Google sign-in was cancelled.')
    if (error?.code === 'auth/popup-blocked') throw new Error('Your browser blocked the Google sign-in popup. Please allow popups for Dayora and try again.')
    if (error?.code === 'auth/unauthorized-domain') throw new Error('This Dayora domain is not authorized in Firebase Authentication.')
    const detail = error?.message ? `: ${error.message}` : ''
    throw new Error(`Google sign-in failed (${error?.code || 'unknown'})${detail}`)
  } finally {
    await signOut(client).catch(() => {})
  }
}
