const escape = (value) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])

export function accountEmail({ origin, purpose, token }) {
  if (!['verify', 'reset'].includes(purpose)) throw new Error('Unsupported account email purpose.')
  const verify = purpose === 'verify'
  const subject = verify ? 'Verify your Dayora email' : 'Reset your Dayora password'
  const action = verify ? 'Verify email' : 'Reset password'
  const expiry = 'the Firebase Authentication email-action expiry policy'
  const url = `${origin}/#${verify ? 'verify-email' : 'reset-password'}?token=${encodeURIComponent(token)}`
  const explanation = verify ? 'Welcome to Dayora. Verify your email to open your private workspace.' : 'You requested a password reset for your Dayora account.'
  const text = `Dayora\nYour Day, Your Way.\n\n${subject}\n\n${explanation}\n\n${action}: ${url}\n\nThis single-use link expires in ${expiry}. If you did not request this, ignore this message. Never share this link.`
  const html = `<html><body style="margin:0;background:#f5f7f4;font-family:Arial,sans-serif;color:#263b30"><main style="max-width:560px;margin:32px auto;background:white;padding:32px;border-radius:20px"><h1 style="color:#193f2b">Dayora</h1><p>Your Day, Your Way.</p><h2>${subject}</h2><p>${explanation}</p><p style="margin:32px 0"><a href="${escape(url)}" style="display:inline-block;background:#193f2b;color:white;padding:14px 24px;border-radius:12px;text-decoration:none">${action}</a></p><p>This single-use link expires in ${expiry}.</p><p>If the button does not work, open:<br><a href="${escape(url)}">${escape(url)}</a></p><p>If you did not request this, ignore this message. Never share this link.</p></main></body></html>`
  return { subject, text, html }
}
