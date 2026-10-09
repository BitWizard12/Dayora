import request from 'supertest'
import { initializeFirebase, closeFirebase } from '../../server/firebaseAdmin.js'
import { readConfig } from '../../server/config.js'
import { createApp } from '../../server/app.js'
import { createAuth } from '../../server/auth.js'
import { createRecordRoutes } from '../../server/records.js'
import { createMediaRoutes } from '../../server/media.js'
import { createWorkspaceRoutes } from '../../server/workspaceAccess.js'
import { ensureAccount, userRef, accountByUid } from '../../server/firebaseRepositories.js'

export async function backend(t, extraRoutes = () => []) {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firebase integration tests require isolated emulators. Run npm test.')
  const config = readConfig({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'demo-dayora', FIREBASE_WEB_API_KEY: 'emulator-public-key', FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST, FIREBASE_STORAGE_EMULATOR_HOST: process.env.FIREBASE_STORAGE_EMULATOR_HOST, FIREBASE_STORAGE_BUCKET: 'demo-dayora.appspot.com', APP_ORIGIN: 'http://localhost:5173' })
  const firebase = initializeFirebase(config)
  t.after(closeFirebase)
  for (const url of [`http://${config.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/demo-dayora/accounts`, `http://${config.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-dayora/databases/(default)/documents`]) {
    const response = await fetch(url, { method: 'DELETE' })
    if (!response.ok) throw new Error('Could not reset the isolated demo emulator fixtures.')
  }
  const mail = [], auth = createAuth({ config, mailer: async (message) => mail.push(message) })
  const app = createApp({ config, routes: [auth.router, createWorkspaceRoutes(auth), createRecordRoutes(auth), createMediaRoutes(auth), ...extraRoutes(auth)] })
  const password = 'a strong testing password 123'
  const account = async (name, role = 'user') => {
    const identity = await firebase.auth.createUser({ displayName: name, email: `${name.toLowerCase()}@example.com`, password, emailVerified: true })
    await ensureAccount(identity); if (role === 'admin') await userRef(identity.uid).update({ role })
    const agent = request.agent(app), login = await agent.post('/api/auth/login').set('Origin', config.APP_ORIGIN).send({ email: identity.email, password })
    if (login.status !== 200) throw new Error(`Fixture login failed: ${login.status}`)
    const csrf = login.body.csrf, send = (method, path, body) => agent[method](`/api${path}`).set('Origin', config.APP_ORIGIN).set('X-CSRF-Token', csrf).send(body)
    return { user: await accountByUid(identity.uid), agent, csrf, send, identity }
  }
  return { app, config, mail, account, auth, firebase, password }
}
