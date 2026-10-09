import 'dotenv/config'
import { readConfig } from './config.js'
import { initializeFirebase, closeFirebase, verifyFirebase, createReadinessProbe } from './firebaseAdmin.js'
import { createApp } from './app.js'
import { createAuth } from './auth.js'
import { createMailer } from './mail.js'
import { createRecordRoutes } from './records.js'
import { createAdminRoutes } from './admin.js'
import { createMediaRoutes } from './media.js'
import { createWorkspaceRoutes } from './workspaceAccess.js'
import { runOperation, OperationalError } from './operations.js'
import { verifyFirebaseWebConfig } from './firebaseAuthApi.js'

await runOperation('api_startup', async () => {
  if (!process.env.NODE_ENV) throw new OperationalError('NODE_ENV must be explicitly set before starting the backend.')
  const config = readConfig(); initializeFirebase(config)
  try { await verifyFirebase(); await verifyFirebaseWebConfig(config) } catch (error) { await closeFirebase(); if (error.code === 'AUTH_CONFIGURATION_ERROR') throw new OperationalError('Firebase Web API key rejected. Check FIREBASE_WEB_API_KEY and its Identity Toolkit API restrictions for the configured project.'); throw error }
  const auth = createAuth({ config, mailer: createMailer(config) }), probe = createReadinessProbe()
  let closing = false
  const app = createApp({ config, readiness: () => closing ? false : probe(), routes: [auth.router, createWorkspaceRoutes(auth), createRecordRoutes(auth), createAdminRoutes(auth), createMediaRoutes(auth)] })
  const server = app.listen(config.PORT, '0.0.0.0', () => console.info(JSON.stringify({ event: 'listening', port: config.PORT, service: 'Dayora' })))
  const shutdown = () => {
    if (closing) return; closing = true
    const timeout = setTimeout(() => process.exit(1), 10000).unref()
    server.close(async () => { try { await closeFirebase(); clearTimeout(timeout); process.exit(0) } catch { process.exit(1) } }); server.closeIdleConnections()
  }
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown)
  server.on('error', async () => { console.error(JSON.stringify({ event: 'listen_failed' })); await closeFirebase().catch(() => {}); process.exitCode = 1 })
})
