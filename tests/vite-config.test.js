import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import viteConfig, { validatePublicEnvironment } from '../vite.config.js'

const production = { mode: 'production', command: 'build' }
const publicEnv = {
  VITE_FIREBASE_API_KEY: 'public-web-key',
  VITE_FIREBASE_PROJECT_ID: 'dayora',
  VITE_FIREBASE_AUTH_DOMAIN: 'dayora.firebaseapp.com',
  VITE_API_URL: '',
}
const vercelEnv = Object.fromEntries([
  'ENV', 'TARGET_ENV', 'URL', 'BRANCH_URL', 'PROJECT_PRODUCTION_URL', 'GIT_COMMIT_SHA',
].map((suffix) => [`VITE_VERCEL_${suffix}`, 'public-system-metadata']))

test('public environment allows only Dayora configuration and the Vercel system namespace', () => {
  assert.doesNotThrow(() => validatePublicEnvironment(publicEnv, production))
  assert.doesNotThrow(() => validatePublicEnvironment({ ...publicEnv, ...vercelEnv }, production))
  for (const key of ['VITE_SECRET', 'VITE_FIREBASE_PRIVATE_KEY', 'VITE_VERCEL', 'VITE_VERCELISH_SECRET']) {
    assert.throws(() => validatePublicEnvironment({ ...publicEnv, ...vercelEnv, [key]: 'private-value' }, production), (error) => /Only the documented/.test(error.message) && !error.message.includes('private-value'))
  }
})

test('emulator configuration remains restricted to explicit localhost demo use', () => {
  const env = { ...publicEnv, VITE_FIREBASE_PROJECT_ID: 'demo-dayora', VITE_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099' }
  assert.doesNotThrow(() => validatePublicEnvironment(env, { mode: 'firebase-test', command: 'build' }))
  assert.doesNotThrow(() => validatePublicEnvironment(env, { mode: 'development', command: 'serve' }))
  assert.throws(() => validatePublicEnvironment(env, production), /Firebase emulators/)
  assert.throws(() => validatePublicEnvironment({ ...env, VITE_FIREBASE_AUTH_EMULATOR_URL: '' }, production), /Firebase emulators/)
  assert.throws(() => validatePublicEnvironment({ ...env, VITE_FIREBASE_PROJECT_ID: 'live-project' }, { mode: 'firebase-test', command: 'build' }), /Firebase emulators/)
})

test('Vite build hook accepts injected Vercel variables and preserves API HTTPS and CSP validation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dayora-vite-env-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const hook = viteConfig.plugins.find((plugin) => plugin.name === 'dayora-public-environment').configResolved
  const check = async (patch = {}) => {
    await writeFile(join(root, '.env.production'), Object.entries({ ...publicEnv, ...vercelEnv, ...patch }).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n'))
    return () => hook({ ...production, root })
  }
  assert.doesNotThrow(await check())
  assert.throws(await check({ VITE_SECRET: 'private-value' }), /Only the documented/)
  for (const value of ['http://api.example', 'https://api.example/path', 'https://user:password@api.example', 'https://api.example?query=1', 'https://api.example#fragment']) {
    assert.throws(await check({ VITE_API_URL: value }), /exact HTTPS origin/)
  }
  assert.throws(await check({ VITE_API_URL: 'https://unconfigured-api.example' }), /API origin is missing from Vercel CSP/)
})
