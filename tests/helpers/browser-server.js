import { Router } from 'express'
import { initializeFirebase, closeFirebase } from '../../server/firebaseAdmin.js'
import { readConfig } from '../../server/config.js'
import { createApp } from '../../server/app.js'
import { createAuth } from '../../server/auth.js'
import { createRecordRoutes } from '../../server/records.js'
import { createAdminRoutes } from '../../server/admin.js'
import { createMediaRoutes } from '../../server/media.js'
import { ensureAccount, userRef } from '../../server/firebaseRepositories.js'
import { accountEmail } from '../../server/mailTemplates.js'

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Browser fixtures require Firebase emulators; live projects are refused.')
const config = readConfig({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'demo-dayora', FIREBASE_WEB_API_KEY: 'emulator-public-key', FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST, FIREBASE_STORAGE_EMULATOR_HOST: process.env.FIREBASE_STORAGE_EMULATOR_HOST, FIREBASE_STORAGE_BUCKET: 'demo-dayora.appspot.com', APP_ORIGIN: 'http://127.0.0.1:4173' })
const firebase = initializeFirebase(config)
// This clear is restricted to the fixed demo project on explicitly configured local emulators.
await fetch(`http://${config.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/demo-dayora/accounts`, { method: 'DELETE' })
await fetch(`http://${config.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-dayora/databases/(default)/documents`, { method: 'DELETE' })
const mail = [], auth = createAuth({ config, mailer: async (message) => mail.push({ ...message, ...accountEmail({ ...message, origin: config.APP_ORIGIN }) }) }), fixture = Router()
fixture.get('/__test/mail', (_req, res) => res.json(mail))
for (const name of ['Alice', 'Bob', 'Administrator', 'Migrator', 'Switcher', 'Sharedtab']) {
  const identity = await firebase.auth.createUser({ displayName: name, email: `${name.toLowerCase()}@example.com`, password: 'dayora browser password 123', emailVerified: true })
  await ensureAccount(identity)
  if (name === 'Administrator') await userRef(identity.uid).update({ role: 'admin' })
}
const app = createApp({ config, routes: [auth.router, createRecordRoutes(auth), createAdminRoutes(auth), createMediaRoutes(auth), fixture] })
const server = app.listen(3101, '127.0.0.1')
let closing = false
async function close() { if (closing) return; closing = true; await new Promise((resolve) => server.close(resolve)); await closeFirebase(); process.exit(0) }
process.on('SIGINT', close); process.on('SIGTERM', close)
