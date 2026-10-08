import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'node:crypto'
import { ApiError, errorHandler } from './errors.js'
import { rateLimit } from 'express-rate-limit'
import { rateLimitStore } from './rateLimitStore.js'
import { createReadinessProbe } from './firebaseAdmin.js'

export function createApp({ config, routes = [], readiness = createReadinessProbe() }) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.TRUST_PROXY)
  app.use((req, res, next) => {
    req.requestId = randomUUID()
    res.set('X-Request-ID', req.requestId)
    const start = Date.now()
    res.on('finish', () => console.info(JSON.stringify({ event: 'request', requestId: req.requestId, method: req.method, path: req.route?.path || '<unmatched>', status: res.statusCode, durationMs: Date.now() - start })))
    next()
  })
  app.use(helmet())
  app.use('/api', rateLimit({ windowMs: 60000, limit: 300, store: rateLimitStore(config, 'api'), standardHeaders: 'draft-8', legacyHeaders: false, skip: (req) => req.path.startsWith('/health/'), message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' } } }))
  app.use(cors({ origin: config.APP_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }))
  app.use(express.json({ limit: '12mb' }))
  app.use(cookieParser())
  app.get('/api/health/live', (_req, res) => res.json({ status: 'ok', service: 'Dayora' }))
  app.get('/api/health/ready', async (_req, res) => { res.set('Cache-Control', 'no-store'); const ready = await readiness(); res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' }) })
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (config.NODE_ENV === 'production' && !req.secure) return next(new ApiError(400, 'HTTPS_REQUIRED', 'HTTPS is required.'))
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== config.APP_ORIGIN) return next(new ApiError(403, 'ORIGIN_REJECTED', 'Request origin is not allowed.'))
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json')) return next(new ApiError(415, 'JSON_REQUIRED', 'Use application/json for API mutations.'))
    next()
  })
  routes.forEach((route) => app.use('/api', route))
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found.')))
  app.use(errorHandler)
  return app
}
