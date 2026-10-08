import nodemailer from 'nodemailer'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { accountEmail } from './mailTemplates.js'
import { OperationalError } from './operations.js'
import { validateMailConfig } from './mailConfig.js'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

export const mailPreviewDirectory = fileURLToPath(new URL('./.mail-preview/', import.meta.url))

export function mailFailure(error) {
  let code = 'SMTP_UNAVAILABLE', detail = 'Provider delivery is unavailable. Try again later.'
  if (error?.code === 'EAUTH' || [534, 535].includes(error?.responseCode)) { code = 'SMTP_AUTH_FAILED'; detail = 'Provider authentication failed. Check the SMTP login and SMTP key/app password.' }
  else if (error?.code === 'ETIMEDOUT') { code = 'SMTP_TIMEOUT'; detail = 'Provider connection timed out. Check network access and provider availability.' }
  else if (['ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'EDNS', 'ENOTFOUND', 'EHOSTUNREACH', 'ESOCKET'].includes(error?.code)) { code = 'SMTP_CONNECTION_FAILED'; detail = 'Provider connection or TLS failed. Check host, port, certificates and network access.' }
  else if (error?.responseCode >= 400 && error?.responseCode < 500) { code = 'SMTP_TEMPORARY_FAILURE'; detail = 'Provider temporarily unavailable or rate limited. Try again later.' }
  else if (error?.command === 'MAIL FROM') { code = 'SMTP_SENDER_REJECTED'; detail = 'Provider rejected the sender. Verify MAIL_FROM and the sending domain with the provider.' }
  else if (error?.code === 'EENVELOPE') { code = 'SMTP_RECIPIENT_REJECTED'; detail = 'Provider rejected the recipient or envelope. Check the destination and provider policy.' }
  const safe = new OperationalError(`Email delivery unavailable. ${detail}`)
  safe.code = code
  return safe
}

export async function verifyMailTransport(transport) {
  try { await transport.verify() } catch (error) { throw mailFailure(error) }
}

export function smtpOptions(config) {
  const url = new URL(config.SMTP_URL)
  const secure = url.protocol === 'smtps:'
  return { host: url.hostname, port: Number(url.port || (secure ? 465 : 587)), secure,
    ...(url.username ? { auth: { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) } } : {}),
    requireTLS: !secure, logger: false, debug: false,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 }
}
export function createMailer(config, { transport, log = console.info, previewDirectory = mailPreviewDirectory } = {}) {
  validateMailConfig(config)
  transport ??= config.MAIL_MODE === 'smtp' ? nodemailer.createTransport(smtpOptions(config)) : null
  return async ({ email, purpose, token }) => {
    const { subject, text, html } = accountEmail({ origin: config.APP_ORIGIN, purpose, token })
    if (transport) {
      const started = Date.now()
      try { const result = await transport.sendMail({ from: config.MAIL_FROM, to: email, subject, text, html, disableFileAccess: true, disableUrlAccess: true }); if (result.rejected?.length) throw Object.assign(new Error(), { code: 'EENVELOPE' }); log(JSON.stringify({ event: 'mail_accepted', purpose, durationMs: Date.now() - started })) }
      catch (error) { const safe = mailFailure(error); log(JSON.stringify({ event: 'mail_failed', purpose, code: safe.code, message: safe.message, durationMs: Date.now() - started })); throw safe }
    }
    else {
      if (config.NODE_ENV === 'production') throw new Error('Preview mail is unavailable in production.')
      await mkdir(previewDirectory, { recursive: true })
      await writeFile(join(previewDirectory, `${randomUUID()}.json`), JSON.stringify({ to: email, subject, text, html }, null, 2), { mode: 0o600 })
      log(JSON.stringify({ event: 'mail_preview', directory: 'server/.mail-preview' }))
    }
  }
}
