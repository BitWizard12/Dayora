export function validatePublicEnvironment(env, config) {
  const publicKeys = ['VITE_API_URL', 'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_AUTH_DOMAIN']
  const emulatorKey = 'VITE_FIREBASE_AUTH_EMULATOR_URL'
  if (Object.keys(env).some((key) => key.startsWith('VITE_') && !publicKeys.includes(key) && key !== emulatorKey && !key.startsWith('VITE_VERCEL_'))) throw new Error('Only the documented Firebase public web configuration and API URL may use VITE_* variables.')
  if (Object.hasOwn(env, emulatorKey) && (!(config.mode === 'firebase-test' || config.command === 'serve') || !env.VITE_FIREBASE_PROJECT_ID?.startsWith('demo-') || !/^http:\/\/(127\.0\.0\.1|localhost):9099$/.test(env[emulatorKey]))) throw new Error('Firebase emulators require explicit localhost demo configuration and are refused in normal production builds.')
}
