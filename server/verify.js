import 'dotenv/config'
import { readConfig } from './config.js'
import { initializeFirebase, verifyFirebase, closeFirebase } from './firebaseAdmin.js'
import { runOperation, OperationalError } from './operations.js'
import { checkSmtp } from './smtp.js'
import { verifyFirebaseWebConfig } from './firebaseAuthApi.js'

await runOperation('production_verification', async () => {
  if (process.argv.includes('--smtp')) {
    await checkSmtp(process.env)
    return
  }
  const config = readConfig()
  initializeFirebase(config)
  try { await verifyFirebase(); await verifyFirebaseWebConfig(config); console.info('Firebase Authentication connectivity, Web API key and Firestore transactional reads verified. No user records were modified. Rules, indexes, Storage and deployed browser behavior require separate checks.') }
  catch (error) { if (error.code === 'AUTH_CONFIGURATION_ERROR') throw new OperationalError('Firebase Web API key rejected. Check FIREBASE_WEB_API_KEY and its Identity Toolkit API restrictions for the configured project.'); throw error }
  finally { await closeFirebase() }
})
