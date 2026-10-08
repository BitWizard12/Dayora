import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { readConfig } from '../server/config.js'
import { createApp } from '../server/app.js'
import { smtpOptions } from '../server/mail.js'

test('Firebase configuration and backend safe health/origin/error responses', async () => {
  assert.throws(() => readConfig({}), /FIREBASE_PROJECT_ID/)
  assert.throws(() => readConfig({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'dayora-production', FIREBASE_WEB_API_KEY: 'public' }), /Production requires/)
  const mail = smtpOptions({ NODE_ENV: 'production', SMTP_URL: 'smtp://user:password@smtp.example.com:587?ignoreTLS=true' })
  assert.equal(mail.requireTLS, true); assert.equal(mail.tls.rejectUnauthorized, true); assert.equal(mail.ignoreTLS, undefined)
  const config = readConfig({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'demo-dayora', FIREBASE_WEB_API_KEY: 'public-test' })
  const app = createApp({ config, readiness: async () => true })
  assert.equal((await request(app).get('/api/health/live')).body.service, 'Dayora')
  assert.equal((await request(app).get('/api/health/ready')).status, 200)
  assert.equal((await request(app).post('/api/missing').set('Origin', 'https://evil.example').send({})).status, 403)
  assert.equal((await request(app).get('/api/missing')).body.error.code, 'NOT_FOUND')
})
