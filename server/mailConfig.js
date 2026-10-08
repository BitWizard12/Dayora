import { z } from 'zod'
import { OperationalError } from './operations.js'

export function validateMailConfig(config) {
  if (config.MAIL_MODE !== 'smtp') return
  if (!config.SMTP_URL) throw new OperationalError('SMTP_URL is required for SMTP delivery.')
  let url
  try {
    url = new URL(config.SMTP_URL)
    if (!['smtp:', 'smtps:'].includes(url.protocol) || !url.hostname || url.search || url.hash || (url.pathname && url.pathname !== '/') || Number(url.port || 587) < 1) throw new Error()
    // Decode here so malformed credential escapes fail before the server listens.
    decodeURIComponent(url.username); decodeURIComponent(url.password)
  } catch { throw new OperationalError('SMTP_URL must be a valid smtp:// or smtps:// URL; percent-encode credentials and omit paths, queries and fragments.') }
  if (url.hostname === 'smtp.resend.com') {
    if (url.protocol !== 'smtps:' || Number(url.port || 465) !== 465 || decodeURIComponent(url.username) !== 'resend') throw new OperationalError('Resend SMTP requires smtps://, port 465 and username resend.')
    const key = decodeURIComponent(url.password)
    if (!key || key === 'YOUR_RESEND_API_KEY') throw new OperationalError('Resend SMTP requires your Resend API key as the password; replace the placeholder in backend secrets.')
  }
  const sender = config.MAIL_FROM?.match(/^(?:[^<>\r\n]+ <([^<>\s]+)>|([^<>\s]+))$/)
  const email = sender?.[1] || sender?.[2]
  if (!email || !z.email().safeParse(email).success || /@example\.(?:com|org|net)$/i.test(email)) throw new OperationalError('MAIL_FROM must identify your provider-verified sender for SMTP delivery.')
}
