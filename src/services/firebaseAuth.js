import { initializeApp } from 'firebase/app'
import { initializeAuth, inMemoryPersistence, connectAuthEmulator, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

let auth
export function firebaseAuth() {
  if (!auth) {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID, apiKey = import.meta.env.VITE_FIREBASE_API_KEY
    if (!projectId || !apiKey) throw new Error('Firebase public web configuration is missing. Configure the Dayora deployment environment.')
    auth = initializeAuth(initializeApp({ projectId, apiKey, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN }), { persistence: inMemoryPersistence })
    if (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL, { disableWarnings: true })
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
    throw new Error('Unable to sign in with Google. Please try again.')
  } finally {
    await signOut(client).catch(() => {})
  }
}
