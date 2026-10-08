import test from 'node:test'
import assert from 'node:assert/strict'
import { firebaseAuthRequest, verifyFirebaseWebConfig } from '../server/firebaseAuthApi.js'
import { accountEmail } from '../server/mailTemplates.js'
import { parseAuthRoute } from '../src/services/authRoutes.js'

const config = { FIREBASE_WEB_API_KEY: 'test-public-key' }
const response = (status, body) => async () => ({ ok: status < 400, status, json: async () => body })

test('production and emulator verification use Firebase oobCode with accounts:update', async () => {
  for (const settings of [config, { ...config, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }]) {
    await firebaseAuthRequest(settings, 'update', { oobCode: 'synthetic-code' }, async (url, options) => {
      assert.equal(url, `${settings.FIREBASE_AUTH_EMULATOR_HOST ? 'http://127.0.0.1:9099/identitytoolkit.googleapis.com' : 'https://identitytoolkit.googleapis.com'}/v1/accounts:update?key=test-public-key`)
      assert.equal(options.method, 'POST')
      assert.deepEqual(JSON.parse(options.body), { oobCode: 'synthetic-code' })
      return { ok: true, json: async () => ({ email: 'fixture@example.com', localId: 'fixture-user' }) }
    })
  }
})

test('invalid Web API keys are configuration failures, never expired-link or login errors', async () => {
  for (const action of ['update', 'resetPassword', 'signInWithPassword']) {
    for (const error of [{ message: 'API key not valid. Please pass a valid API key.' }, { message: 'PERMISSION_DENIED', details: [{ reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }] }]) {
      await assert.rejects(firebaseAuthRequest(config, action, { oobCode: 'secret-action' }, response(400, { error })), (failure) => {
        assert.equal(failure.status, 503); assert.equal(failure.code, 'AUTH_CONFIGURATION_ERROR')
        assert.ok(!failure.message.includes('secret-action')); assert.ok(!failure.message.includes(config.FIREBASE_WEB_API_KEY)); return true
      })
    }
  }
})

test('expired and used codes stay rejected; upstream outages and throttling are distinct', async () => {
  for (const message of ['INVALID_OOB_CODE', 'EXPIRED_OOB_CODE']) {
    await assert.rejects(firebaseAuthRequest(config, 'update', {}, response(400, { error: { message } })), { status: 400, code: 'INVALID_AUTH_ACTION' })
  }
  await assert.rejects(firebaseAuthRequest(config, 'update', {}, response(429, {})), { status: 429, code: 'AUTH_RATE_LIMITED' })
  await assert.rejects(firebaseAuthRequest(config, 'update', {}, response(500, {})), { status: 503, code: 'AUTH_UNAVAILABLE' })
  await assert.rejects(firebaseAuthRequest(config, 'update', {}, async () => { throw new Error('secret transport URL') }), { status: 503, code: 'AUTH_UNAVAILABLE' })
})

test('startup Web API validation is read-only and accepts Firebase numeric project identifiers', async () => {
  const result = await verifyFirebaseWebConfig(config, async (url, options) => {
    assert.equal(url, 'https://identitytoolkit.googleapis.com/v1/projects?key=test-public-key')
    assert.equal(options.method, 'GET'); assert.equal(options.body, undefined)
    return { ok: true, json: async () => ({ projectId: '1234567890' }) }
  })
  assert.equal(result.projectId, '1234567890')
  await assert.rejects(verifyFirebaseWebConfig(config, response(400, { error: { message: 'API_KEY_INVALID' } })), { code: 'AUTH_CONFIGURATION_ERROR' })
})

test('verification and reset email URLs round-trip encoded action codes exactly once', () => {
  for (const purpose of ['verify', 'reset']) {
    const token = 'synthetic+/%?&=code'
    const email = accountEmail({ origin: 'http://localhost:5173', purpose, token })
    const url = new URL(email.text.match(/(?:Verify email|Reset password): (\S+)/)[1])
    assert.deepEqual(parseAuthRoute(url.hash), { view: purpose === 'verify' ? 'verify-email' : 'reset-password', token })
  }
  assert.deepEqual(parseAuthRoute('#verify-email'), { view: 'verify-email', token: '' })
})
