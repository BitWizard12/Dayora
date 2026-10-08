import { initializeApp, cert, applicationDefault, deleteApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { randomUUID } from 'node:crypto'
import { OperationalError } from './operations.js'

let current
export function getFirebase() { if (!current) throw new OperationalError('Firebase services have not been initialized.'); return current }
export function initializeFirebase(config) {
  if (config.FIREBASE_AUTH_EMULATOR_HOST) process.env.METADATA_SERVER_DETECTION = 'none'
  for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) if (config[key]) process.env[key] = config[key]
  let credential
  if (config.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try { const value = JSON.parse(config.FIREBASE_SERVICE_ACCOUNT_JSON); if (value.project_id !== config.FIREBASE_PROJECT_ID) throw new Error(); credential = cert(value) }
    catch { throw new OperationalError('Invalid Firebase Admin service-account configuration/project mismatch. No credential values were logged.') }
  } else if (!config.FIREBASE_AUTH_EMULATOR_HOST) credential = applicationDefault()
  const app = initializeApp({ projectId: config.FIREBASE_PROJECT_ID, ...(credential ? { credential } : {}), ...(config.FIREBASE_STORAGE_BUCKET ? { storageBucket: config.FIREBASE_STORAGE_BUCKET } : {}) }, `dayora-${randomUUID()}`)
  current = { app, auth: getAuth(app), db: getFirestore(app), config, bucket: config.FIREBASE_STORAGE_BUCKET ? getStorage(app).bucket() : null }
  return current
}
export async function closeFirebase() { if (!current) return; const previous = current; current = null; await previous.db.terminate(); await deleteApp(previous.app) }
export async function withDeadline(operation, ms = 5000) {
  let timer
  try { return await Promise.race([operation, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new OperationalError('Firebase service verification timed out.')), ms) })]) }
  finally { clearTimeout(timer) }
}
export async function verifyFirebase() {
  const { auth, db } = getFirebase()
  await withDeadline(Promise.all([auth.listUsers(1), db.doc('system/health').get()]))
  await withDeadline(db.runTransaction(async (transaction) => { await transaction.get(db.doc('system/health')) }, { readOnly: true }))
}
export function createReadinessProbe() { let pending; return () => pending ||= verifyFirebase().then(() => true).catch(() => false).finally(() => { pending = undefined }) }
