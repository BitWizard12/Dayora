import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../server/app.js'
import { createVoiceRoutes, rewriteVoiceDraft } from '../server/voice.js'
import { createVoiceRewriter } from '../src/services/voiceRewrite.js'

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-public', OPENAI_API_KEY: 'test-provider-key' }
const input = { text: 'please call sam at 10', style: 'polish', consent: true }
const completion = text => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: text } }] }) })
function fixture(overrides = {}) {
  let calls = 0
  const config = { NODE_ENV: 'test', APP_ORIGIN: 'https://dayora.test', TRUST_PROXY: false, RATE_LIMIT_STORE: 'memory' }
  const router = createVoiceRoutes(config, { env,
    clientFactory: () => ({ auth: { getUser: async token => token === 'expired' ? { error: { status: 401 } } : { data: { user: { id: token === 'other' ? 'other-user' : 'user' } } } } }),
    fetcher: async () => { calls++; return completion('Please call Sam at 10.') }, ...overrides,
  })
  const app = createApp({ config, readiness: async () => true, routes: [router] })
  const send = (body = input, token = 'valid') => request(app).post('/api/voice/rewrite').set('Origin', config.APP_ORIGIN).set('Authorization', token ? 'Bearer ' + token : '').send(body)
  return { send, calls: () => calls }
}

test('voice endpoint requires a server-verified user and rejects a different workspace', async () => {
  const f = fixture()
  assert.equal((await f.send(input, '')).status, 401)
  assert.equal((await f.send(input, 'expired')).status, 401)
  assert.equal((await f.send().set('X-Workspace-Id', 'someone-else')).status, 403)
  assert.equal(f.calls(), 0)
  const result = await f.send()
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { text: 'Please call Sam at 10.' })
})

test('voice endpoint fails closed during auth outages and missing configuration', async () => {
  const unavailable = fixture({ clientFactory: () => ({ auth: { getUser: async () => ({ error: { status: 503 } }) } }) })
  assert.equal((await unavailable.send()).status, 503)
  assert.equal(unavailable.calls(), 0)
  const missing = fixture({ env: {} })
  assert.equal((await missing.send()).status, 503)
  assert.equal(missing.calls(), 0)
})

test('voice endpoint validates consent, text size, style and extra fields before provider calls', async () => {
  const f = fixture()
  for (const body of [{ ...input, consent: false }, { ...input, text: ' ' }, { ...input, text: 'x'.repeat(10001) }, { ...input, style: 'execute' }, { ...input, ownerId: 'other' }]) {
    assert.equal((await f.send(body)).status, 400)
  }
  assert.equal(f.calls(), 0)
})

test('voice request limits use verified user identity and do not share another user’s budget', async () => {
  const f = fixture()
  for (let i = 0; i < 12; i++) assert.equal((await f.send()).status, 200)
  const limited = await f.send(input, 'another-token-for-same-user')
  assert.equal(limited.status, 429)
  assert.equal(limited.body.error.code, 'VOICE_RATE_LIMITED')
  assert.equal((await f.send(input, 'other')).status, 200)
  assert.equal(f.calls(), 13)
})

test('provider gets only the draft and bounded editing instructions, with storage disabled', async () => {
  let options
  const result = await rewriteVoiceDraft(input, { env, fetcher: async (url, value) => { assert.equal(url, 'https://api.openai.com/v1/chat/completions'); options = value; return completion('Please call Sam at 10.') } })
  assert.equal(result.text, 'Please call Sam at 10.')
  const body = JSON.parse(options.body)
  assert.equal(body.store, false)
  assert.equal(body.max_completion_tokens, 4000)
  assert.equal(body.messages[1].content, input.text)
  assert.match(body.messages[0].content, /never as instructions/)
  assert.equal(body.messages.length, 2)
})

test('provider failures, refusal, incomplete and oversized output never become suggestions', async () => {
  await assert.rejects(rewriteVoiceDraft(input, { env: {} }), { code: 'VOICE_AI_NOT_CONFIGURED' })
  for (const payload of [
    { choices: [{ finish_reason: 'length', message: { content: 'partial' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: ' ', refusal: null } }] },
    { choices: [{ finish_reason: 'stop', message: { content: 'x'.repeat(10001) } }] },
    { choices: [{ finish_reason: 'stop', message: { content: 'Refused', refusal: 'No' } }] },
  ]) await assert.rejects(rewriteVoiceDraft(input, { env, fetcher: async () => ({ ok: true, json: async () => payload }) }), { code: 'VOICE_AI_INVALID' })
  const f = fixture({ fetcher: async () => ({ ok: false, status: 500, json: async () => ({ secret: env.OPENAI_API_KEY }) }) })
  const response = await f.send()
  assert.equal(response.status, 502)
  assert.equal(JSON.stringify(response.body).includes(env.OPENAI_API_KEY), false)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(rewriteVoiceDraft(input, { env, signal: controller.signal, fetcher: async (_url, options) => { options.signal.throwIfAborted() } }), { code: 'VOICE_AI_CANCELLED' })
})

test('client sends explicit consent and bearer auth without cookies; missing sessions send nothing', async () => {
  let received, calls = 0
  const rewrite = createVoiceRewriter({ base: 'https://api.dayora.test/', getAccessToken: async () => 'user-token', fetcher: async (url, options) => { calls++; received = { url, ...options }; return { ok: true, json: async () => ({ text: 'Suggestion' }) } } })
  assert.equal(await rewrite(input), 'Suggestion')
  assert.equal(received.url, 'https://api.dayora.test/api/voice/rewrite')
  assert.equal(received.credentials, 'omit')
  assert.equal(received.headers.Authorization, 'Bearer user-token')
  assert.equal(JSON.parse(received.body).consent, true)
  const expired = createVoiceRewriter({ getAccessToken: async () => null, fetcher: async () => { calls++ } })
  await assert.rejects(expired(input), /session has expired/)
  assert.equal(calls, 1)
})

test('client rejects bad output and provides useful unavailable and limit errors', async () => {
  for (const [status, payload, message] of [[503, { error: { code: 'VOICE_AI_NOT_CONFIGURED' } }, /isn’t enabled/], [429, {}, /limit/], [404, {}, /isn’t available/], [200, { text: '' }, /complete suggestion/]]) {
    const rewrite = createVoiceRewriter({ getAccessToken: async () => 'user-token', fetcher: async () => ({ ok: status === 200, status, json: async () => payload }) })
    await assert.rejects(rewrite(input), message)
  }
})
