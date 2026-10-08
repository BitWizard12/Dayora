import { z } from 'zod'
import { OperationalError } from './operations.js'
import { validateMailConfig } from './mailConfig.js'

export function readConfig(env = process.env) {
  const parsed = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'), PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    FIREBASE_PROJECT_ID: z.string().regex(/^[a-z][a-z0-9-]{4,62}$/), FIREBASE_WEB_API_KEY: z.string().min(1),
    FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(), FIREBASE_STORAGE_BUCKET: z.string().optional(),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(), FIRESTORE_EMULATOR_HOST: z.string().optional(), FIREBASE_STORAGE_EMULATOR_HOST: z.string().optional(),
    APP_ORIGIN: z.string().url().default('http://localhost:5173'), COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'), TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    MAIL_MODE: z.enum(['smtp', 'preview']).default('preview'), SMTP_URL: z.string().url().regex(/^smtps?:\/\//).optional(), MAIL_FROM: z.string().default('Dayora <hello@example.com>'), RATE_LIMIT_STORE: z.enum(['memory', 'firestore']).optional(),
  }).safeParse(env)
  if (!parsed.success) throw new OperationalError(`Invalid environment: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`)
  const config = parsed.data, origin = new URL(config.APP_ORIGIN)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new OperationalError('APP_ORIGIN must be an exact HTTP(S) origin without credentials, path, query or fragment.')
  config.APP_ORIGIN = origin.origin
  const emulatorHosts = [config.FIREBASE_AUTH_EMULATOR_HOST, config.FIRESTORE_EMULATOR_HOST, config.FIREBASE_STORAGE_EMULATOR_HOST].filter(Boolean)
  if (emulatorHosts.some((host) => !/^(?:127\.0\.0\.1|localhost):\d+$/.test(host))) throw new OperationalError('Emulators must use explicit localhost host:port values.')
  if (emulatorHosts.length && (!config.FIREBASE_AUTH_EMULATOR_HOST || !config.FIRESTORE_EMULATOR_HOST || !config.FIREBASE_PROJECT_ID.startsWith('demo-'))) throw new OperationalError('Use a demo- project with both Auth and Firestore emulators; partial/live emulator configurations are refused.')
  if (emulatorHosts.length && config.FIREBASE_STORAGE_BUCKET && !config.FIREBASE_STORAGE_EMULATOR_HOST) throw new OperationalError('Local image storage requires the Storage emulator; mixed emulator/live media configurations are refused.')
  validateMailConfig(config)
  if (config.NODE_ENV === 'production') {
    if (emulatorHosts.length || Object.keys(env).some((key) => key.endsWith('EMULATOR_HOST') && env[key])) throw new OperationalError('Production refuses all Firebase emulator configuration.')
    if (!config.APP_ORIGIN.startsWith('https://') || config.MAIL_MODE !== 'smtp' || !config.SMTP_URL || env.TRUST_PROXY === undefined || !env.MAIL_FROM) throw new OperationalError('Production requires HTTPS APP_ORIGIN, explicit TRUST_PROXY and a real SMTP sender/delivery configuration.')
    const sender = config.MAIL_FROM.match(/^(?:[^<>\r\n]+ <([^<>\s]+)>|([^<>\s]+))$/), email = sender?.[1] || sender?.[2]
    if (!email || !z.email().safeParse(email).success || /@example\.(?:com|org|net)$/i.test(email)) throw new OperationalError('MAIL_FROM must identify your provider-verified production sender.')
    if (!config.FIREBASE_SERVICE_ACCOUNT_JSON && !env.GOOGLE_APPLICATION_CREDENTIALS && !env.K_SERVICE) throw new OperationalError('Configure Firebase Admin service-account credentials or an approved ADC runtime.')
    if (!config.FIREBASE_STORAGE_BUCKET) throw new OperationalError('FIREBASE_STORAGE_BUCKET is required for production profile/member photos.')
  }
  if (config.COOKIE_SAME_SITE === 'none' && config.NODE_ENV !== 'production') throw new OperationalError('SameSite=None requires production HTTPS.')
  config.RATE_LIMIT_STORE ||= config.NODE_ENV === 'production' ? 'firestore' : 'memory'
  if (config.NODE_ENV === 'production' && config.RATE_LIMIT_STORE !== 'firestore') throw new OperationalError('Production requires the shared Firestore rate-limit store.')
  return Object.freeze(config)
}
