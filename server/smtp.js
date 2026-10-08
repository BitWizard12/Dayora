import 'dotenv/config'
import nodemailer from 'nodemailer'
import { z } from 'zod'
import { pathToFileURL } from 'node:url'
import { validateMailConfig } from './mailConfig.js'
import { smtpOptions, verifyMailTransport, mailFailure } from './mail.js'
import { OperationalError, runOperation } from './operations.js'

export async function checkSmtp(env, { sendTest = false, createTransport = nodemailer.createTransport, report = console.info } = {}) {
  if (env.MAIL_MODE !== 'smtp') throw new OperationalError('SMTP verification requires MAIL_MODE=smtp.')
  validateMailConfig(env)
  if (new URL(env.SMTP_URL).hostname === 'smtp.resend.com' && env.MAIL_FROM?.includes('onboarding@resend.dev')) report('Resend onboarding sender supports testing to your Resend account email only. Verify your own domain and update MAIL_FROM before sending to other users.')
  // Gate before making any network connection. Verification never sends mail.
  if (sendTest && (env.SMTP_TEST_CONFIRM !== 'SEND_TEST_EMAIL' || !z.email().safeParse(env.SMTP_TEST_TO).success)) throw new OperationalError('Test delivery requires a valid SMTP_TEST_TO and SMTP_TEST_CONFIRM=SEND_TEST_EMAIL.')
  const transport = createTransport(smtpOptions(env))
  try {
    await verifyMailTransport(transport)
    report('SMTP connection, TLS and authentication verified. Sender acceptance and inbox delivery remain unverified.')
    if (sendTest) {
      try {
        const result = await transport.sendMail({ from: env.MAIL_FROM, to: env.SMTP_TEST_TO, subject: 'Dayora SMTP delivery test', text: 'Dayora — Your Day, Your Way.\nThis is an explicitly requested SMTP delivery test. No account action is required.', disableFileAccess: true, disableUrlAccess: true })
        if (result.rejected?.length) throw Object.assign(new Error(), { code: 'EENVELOPE' })
      } catch (error) { throw mailFailure(error) }
      report('SMTP accepted the Dayora test email. Check the intended inbox/spam folder.')
    }
  } finally { transport.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runOperation('smtp_check', () => checkSmtp(process.env, { sendTest: process.argv.includes('--send-test') }))
