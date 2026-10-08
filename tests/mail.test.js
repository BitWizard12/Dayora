import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readConfig } from '../server/config.js'
import { createMailer, smtpOptions, mailPreviewDirectory } from '../server/mail.js'
import { checkSmtp } from '../server/smtp.js'

const base = { NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'demo-dayora', FIREBASE_WEB_API_KEY: 'public' }
const smtp = { ...base, MAIL_MODE: 'smtp', MAIL_FROM: 'Dayora <hello@dayora.example>', SMTP_URL: 'smtp://synthetic-user:synthetic-secret@smtp.example.com:587' }

test('Resend configuration enforces implicit TLS, login and a supplied backend key', async () => {
  const resend = { ...base, MAIL_MODE: 'smtp', MAIL_FROM: 'Dayora <onboarding@resend.dev>', SMTP_URL: 'smtps://resend:synthetic-test-key@smtp.resend.com:465' }
  const config = readConfig(resend), options = smtpOptions(config)
  assert.equal(options.host, 'smtp.resend.com'); assert.equal(options.port, 465); assert.equal(options.secure, true)
  assert.deepEqual(options.auth, { user: 'resend', pass: 'synthetic-test-key' })
  assert.equal(options.tls.rejectUnauthorized, true); assert.equal(options.tls.minVersion, 'TLSv1.2')
  for (const url of ['smtp://resend:synthetic-test-key@smtp.resend.com:587', 'smtps://wrong:synthetic-test-key@smtp.resend.com:465', 'smtps://resend:synthetic-test-key@smtp.resend.com:587', 'smtps://resend@smtp.resend.com:465', 'smtps://resend:YOUR_RESEND_API_KEY@smtp.resend.com:465']) assert.throws(() => readConfig({ ...resend, SMTP_URL: url }), (error) => /Resend SMTP/.test(error.message) && !error.message.includes('synthetic-test-key'))
  const reports = []
  await checkSmtp(resend, { report: (line) => reports.push(line), createTransport: (settings) => { assert.equal(settings.secure, true); assert.equal(settings.port, 465); return { verify: async () => {}, close: () => {} } } })
  assert.ok(reports.some((line) => line.includes('your Resend account email only')))
  assert.ok(!reports.join('').includes('synthetic-test-key'))
})

test('SMTP validates before startup without disclosing invalid configuration', () => {
  for (const patch of [{ SMTP_URL: undefined }, { SMTP_URL: 'smtp://user:%ZZ@host' }, { SMTP_URL: 'smtp://user:private@host?ignoreTLS=true' }, { SMTP_URL: 'https://user:private@host' }, { MAIL_FROM: undefined }, { MAIL_FROM: 'bad\r\nBcc: private@example.com' }, { MAIL_FROM: 'hello@example.com' }]) {
    assert.throws(() => readConfig({ ...smtp, ...patch }), (error) => !/private|%ZZ|Bcc/.test(error.message))
  }
  assert.equal(readConfig(base).MAIL_MODE, 'preview')
  const options = smtpOptions({ ...smtp, SMTP_URL: 'smtp://user%40domain:pass%3Aword@host:587' })
  assert.deepEqual(options.auth, { user: 'user@domain', pass: 'pass:word' })
  assert.equal(options.requireTLS, true); assert.equal(options.tls.rejectUnauthorized, true)
  assert.equal(options.logger, false); assert.equal(options.debug, false)
  assert.equal(smtpOptions({ SMTP_URL: 'smtps://host' }).secure, true)
})

test('preview writes branded verification/reset JSON and keeps tokens out of logs', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dayora-mail-')); t.after(() => rm(directory, { recursive: true, force: true }))
  const logs = [], mailer = createMailer(readConfig(base), { previewDirectory: directory, log: (line) => logs.push(line) })
  assert.match(mailPreviewDirectory.replaceAll('\\', '/'), /server\/\.mail-preview\/$/)
  for (const purpose of ['verify', 'reset']) await mailer({ email: 'recipient@example.com', purpose, token: 'private-action' })
  const messages = await Promise.all((await readdir(directory)).map(async (file) => JSON.parse(await readFile(join(directory, file), 'utf8'))))
  assert.equal(messages.length, 2)
  assert.ok(messages.some((mail) => mail.subject === 'Verify your Dayora email' && mail.html.includes('#verify-email?token=private-action')))
  assert.ok(messages.some((mail) => mail.subject === 'Reset your Dayora password' && mail.html.includes('#reset-password?token=private-action')))
  assert.ok(!logs.join('').includes('private-action'))
  await assert.rejects(createMailer({ ...base, NODE_ENV: 'production', MAIL_MODE: 'preview' })({ purpose: 'verify', token: 'x' }), /Preview mail/)
})

test('SMTP sends both templates through the same transport and reports safe failure categories', async () => {
  const sent = [], logs = [], mailer = createMailer(readConfig(smtp), { transport: { sendMail: async (mail) => { sent.push(mail); return { accepted: [mail.to] } } }, log: (line) => logs.push(line) })
  for (const purpose of ['verify', 'reset']) await mailer({ email: 'private@example.com', purpose, token: 'private-action' })
  assert.equal(sent.length, 2); assert.ok(sent.every((mail) => mail.from === smtp.MAIL_FROM && mail.disableUrlAccess && mail.disableFileAccess))
  for (const [upstream, code] of [[{ code: 'EAUTH' }, 'SMTP_AUTH_FAILED'], [{ code: 'ECONNECTION' }, 'SMTP_CONNECTION_FAILED'], [{ code: 'ETIMEDOUT' }, 'SMTP_TIMEOUT'], [{ command: 'MAIL FROM', responseCode: 550 }, 'SMTP_SENDER_REJECTED'], [{ responseCode: 451 }, 'SMTP_TEMPORARY_FAILURE'], [{ code: 'EENVELOPE' }, 'SMTP_RECIPIENT_REJECTED'], [{}, 'SMTP_UNAVAILABLE']]) {
    const failing = createMailer(readConfig(smtp), { transport: { sendMail: async () => { throw Object.assign(new Error(`${smtp.SMTP_URL} private-action private@example.com`), upstream) } }, log: (line) => logs.push(line) })
    await assert.rejects(failing({ email: 'private@example.com', purpose: 'verify', token: 'private-action' }), (error) => error.code === code && !/synthetic-secret|private-action|private@example/.test(error.message))
  }
  const rejected = createMailer(readConfig(smtp), { transport: { sendMail: async () => ({ rejected: ['private@example.com'] }) }, log: (line) => logs.push(line) })
  await assert.rejects(rejected({ email: 'private@example.com', purpose: 'reset', token: 'private-action' }), { code: 'SMTP_RECIPIENT_REJECTED' })
  assert.ok(!/synthetic-user|synthetic-secret|smtp:\/\/|private-action|private@example/.test(logs.join('')))
})

test('SMTP verify never sends; test command requires both explicit variables and closes transport', async () => {
  let connects = 0, sends = 0, closes = 0
  const dependencies = { report: () => {}, createTransport: () => { connects++; return { verify: async () => {}, sendMail: async (mail) => { sends++; assert.ok(!mail.text.includes('token=')); return {} }, close: () => closes++ } } }
  const confirmed = { ...smtp, SMTP_TEST_TO: 'test@example.com', SMTP_TEST_CONFIRM: 'SEND_TEST_EMAIL' }
  await checkSmtp(confirmed, dependencies); assert.equal(sends, 0)
  for (const patch of [{ SMTP_TEST_TO: undefined }, { SMTP_TEST_CONFIRM: undefined }, { SMTP_TEST_TO: 'invalid' }]) await assert.rejects(checkSmtp({ ...confirmed, ...patch }, { ...dependencies, sendTest: true }), /requires/)
  assert.equal(connects, 1)
  await checkSmtp(confirmed, { ...dependencies, sendTest: true }); assert.equal(sends, 1); assert.equal(closes, 2)
  await assert.rejects(checkSmtp(smtp, { report: () => {}, createTransport: () => ({ verify: async () => { throw Object.assign(new Error(smtp.SMTP_URL), { code: 'EAUTH' }) }, close: () => closes++ }) }), { code: 'SMTP_AUTH_FAILED' })
  assert.equal(closes, 3)
})
