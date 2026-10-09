import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { getFirebase } from './firebaseAdmin.js'
import { ensureAccount, userRef, sessionRef, accountByUid, revokeAccountSessions } from './firebaseRepositories.js'
import { ApiError } from './errors.js'
import { rateLimitStore } from './rateLimitStore.js'
import { firebaseAuthRequest } from './firebaseAuthApi.js'
import { storePhoto } from './media.js'

export const hashToken = (value) => createHash('sha256').update(value).digest('hex')
const token = () => randomBytes(32).toString('base64url')
const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase())
const passwordSchema = z.string().min(12).max(128), actionSchema = z.string().min(1).max(2000)
export const publicUser = (user) => ({ id: user.id, email: user.email, name: user.name, role: user.role, verified: !!user.verifiedAt, active: user.active, workspaceId: user.workspaceId, activeWorkspaceId: user.activeWorkspaceId || user.workspaceId, onboardingComplete: user.onboardingComplete !== false, about: user.about || '', jobTitle: user.jobTitle || '', photo: user.photo || '', createdAt: user.createdAt })
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export function createAuth({ config, mailer }) {
  const router = Router(), firebase = getFirebase()
  const cookieName = config.NODE_ENV === 'production' ? '__Host-dayora' : 'dayora-session', keyName = `${cookieName}-key`
  const cookieOptions = { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: config.COOKIE_SAME_SITE, path: '/' }
  const limiter = (limit, prefix) => rateLimit({ windowMs: 15 * 60000, limit, store: rateLimitStore(config, prefix), standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } } })
  const loginLimit = limiter(15, 'auth-login'), mailLimit = limiter(10, 'auth-mail')
  const clearCookie = (res) => { res.clearCookie(cookieName, cookieOptions); res.clearCookie(keyName, cookieOptions) }
  const authenticate = async (req, _res, next) => {
    try {
      const cookie = req.cookies[cookieName], key = req.cookies[keyName]
      if (!cookie || !key || !/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Error()
      const decoded = await firebase.auth.verifySessionCookie(cookie, true)
      const [identity, user, stored] = await Promise.all([firebase.auth.getUser(decoded.uid), accountByUid(decoded.uid), sessionRef(decoded.uid, hashToken(key)).get()])
      const session = stored.data()
      if (!identity.emailVerified || identity.disabled || !user?.active || !session || session.cookieHash !== hashToken(cookie) || session.expiresAt.toMillis() <= Date.now() || session.version !== user.sessionVersion) throw new Error()
      req.user = user; req.session = { ...session, id: stored.id, expiresAt: session.expiresAt.toDate() }; next()
    } catch (error) {
      if (typeof error.code === 'number' || ['auth/internal-error', 'app/network-error', 'app/network-timeout'].includes(error.code)) throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Session verification is temporarily unavailable. Please try again.')
      throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in.')
    }
  }
  const csrf = (req, _res, next) => equal(req.get('X-CSRF-Token'), req.session.csrf) ? next() : next(new ApiError(403, 'CSRF_REJECTED', 'Please refresh your session and try again.'))
  const admin = (req, _res, next) => req.user.role === 'admin' ? next() : next(new ApiError(403, 'FORBIDDEN', 'Administrator access required.'))
  const sendAction = async (identity, purpose) => {
    const link = purpose === 'verify' ? await firebase.auth.generateEmailVerificationLink(identity.email) : await firebase.auth.generatePasswordResetLink(identity.email)
    const code = new URL(link).searchParams.get('oobCode')
    if (!code) throw new ApiError(503, 'MAIL_UNAVAILABLE', 'Email delivery is unavailable.')
    try { await mailer({ email: identity.email, purpose, token: code }) } catch { console.error(JSON.stringify({ event: 'mail_dispatch_failed', purpose })) }
  }
  router.post('/auth/signup', mailLimit, async (req, res) => {
    const input = z.object({ email: emailSchema, password: passwordSchema, name: z.string().trim().min(1).max(100) }).strict().parse(req.body)
    try {
      const identity = await firebase.auth.createUser({ email: input.email, password: input.password, displayName: input.name, emailVerified: false })
      await ensureAccount(identity); await sendAction(identity, 'verify')
    } catch (error) { if (error.code !== 'auth/email-already-exists') throw error }
    res.status(202).json({ message: 'If this email is available, a verification link has been sent. Check your email before signing in.' })
  })
  router.post('/auth/login', loginLimit, async (req, res) => {
    const input = z.union([z.object({ idToken: z.string().min(1).max(10000), remember: z.boolean().default(false) }).strict(), z.object({ email: emailSchema, password: z.string().min(1).max(128), remember: z.boolean().default(false) }).strict()]).parse(req.body)
    const idToken = input.idToken || (await firebaseAuthRequest(config, 'signInWithPassword', { email: input.email, password: input.password, returnSecureToken: true })).idToken
    let decoded, identity
    try { decoded = await firebase.auth.verifyIdToken(idToken, true); identity = await firebase.auth.getUser(decoded.uid) } catch { throw new ApiError(401, 'LOGIN_FAILED', 'Unable to sign in. Check your credentials and email verification.') }
    if (!identity.emailVerified || identity.disabled || Date.now() / 1000 - decoded.auth_time > 300) throw new ApiError(401, 'LOGIN_FAILED', 'Unable to sign in. Check your credentials and email verification.')
    await ensureAccount(identity)
    const expiresIn = (input.remember ? 14 * 24 : 12) * 3600000
    const cookie = await firebase.auth.createSessionCookie(idToken, { expiresIn }), key = token(), csrfValue = token()
    const user = await firebase.db.runTransaction(async (transaction) => {
      const ref = userRef(decoded.uid), snapshot = await transaction.get(ref), value = snapshot.data()
      if (!value?.active) throw new ApiError(401, 'LOGIN_FAILED', 'Account is inactive.')
      const next = { ...value, verifiedAt: value.verifiedAt || Date.now(), email: identity.email.toLowerCase(), lastLoginAt: Date.now() }
      transaction.set(ref, next)
      transaction.create(sessionRef(decoded.uid, hashToken(key)), { cookieHash: hashToken(cookie), csrf: csrfValue, version: next.sessionVersion, createdAt: Date.now(), expiresAt: new Date(Date.now() + expiresIn) })
      return { id: decoded.uid, ...next }
    })
    for (const [name, value] of [[cookieName, cookie], [keyName, key]]) res.cookie(name, value, { ...cookieOptions, ...(input.remember ? { maxAge: expiresIn } : {}) })
    res.json({ user: publicUser(user), csrf: csrfValue })
  })
  router.post('/auth/forgot-password', mailLimit, async (req, res) => {
    const { email } = z.object({ email: emailSchema }).strict().parse(req.body)
    try { const identity = await firebase.auth.getUserByEmail(email), user = await accountByUid(identity.uid); if (!identity.disabled && identity.emailVerified && user?.active !== false) await sendAction(identity, 'reset') } catch (error) { if (error.code !== 'auth/user-not-found') throw error }
    res.status(202).json({ message: 'If the account is eligible, a reset link has been sent.' })
  })
  router.post('/auth/resend-verification', mailLimit, async (req, res) => {
    const { email } = z.object({ email: emailSchema }).strict().parse(req.body)
    try { const identity = await firebase.auth.getUserByEmail(email); await ensureAccount(identity); if (!identity.disabled && !identity.emailVerified) await sendAction(identity, 'verify') } catch (error) { if (error.code !== 'auth/user-not-found') throw error }
    res.status(202).json({ message: 'If the account needs verification, a new link has been sent.' })
  })
  router.post('/auth/verify-email', mailLimit, async (req, res) => {
    const { token: code } = z.object({ token: actionSchema }).strict().parse(req.body)
    const result = await firebaseAuthRequest(config, 'update', { oobCode: code })
    const identity = await firebase.auth.getUserByEmail(result.email)
    if (!identity.emailVerified || identity.disabled) throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Email verification could not be confirmed. Please try again.')
    await ensureAccount(identity); await userRef(identity.uid).update({ verifiedAt: Date.now() })
    res.json({ message: 'Email verified. You can now sign in.' })
  })
  router.post('/auth/reset-password', mailLimit, async (req, res) => {
    const input = z.object({ token: actionSchema, password: passwordSchema }).strict().parse(req.body)
    const checked = await firebaseAuthRequest(config, 'resetPassword', { oobCode: input.token })
    const identity = await firebase.auth.getUserByEmail(checked.email)
    await revokeAccountSessions(identity.uid)
    await firebaseAuthRequest(config, 'resetPassword', { oobCode: input.token, newPassword: input.password })
    await firebase.auth.revokeRefreshTokens(identity.uid)
    clearCookie(res); res.json({ message: 'Password reset. Sign in with your new password.' })
  })
  router.get('/auth/session', authenticate, (req, res) => res.json({ user: publicUser(req.user), csrf: req.session.csrf, expiresAt: req.session.expiresAt }))
  router.post('/auth/logout', authenticate, csrf, async (req, res) => { await sessionRef(req.user.id, req.session.id).delete(); clearCookie(res); res.json({ message: 'Signed out.' }) })
  router.post('/auth/logout-others', authenticate, csrf, async (req, res) => { await revokeAccountSessions(req.user.id, { except: req.session.id }); res.json({ message: 'Other sessions signed out.' }) })
  const reauthenticate = async (user, password) => { const identity = await firebaseAuthRequest(config, 'signInWithPassword', { email: user.email, password, returnSecureToken: true }); if (identity.localId !== user.id) throw new ApiError(403, 'REAUTH_REQUIRED', 'Reauthentication required.'); return identity }
  router.post('/auth/change-password', authenticate, csrf, loginLimit, async (req, res) => {
    const input = z.object({ currentPassword: z.string().min(1).max(128), password: passwordSchema }).strict().parse(req.body)
    await reauthenticate(req.user, input.currentPassword)
    await revokeAccountSessions(req.user.id)
    await firebase.auth.updateUser(req.user.id, { password: input.password }); await firebase.auth.revokeRefreshTokens(req.user.id)
    clearCookie(res); res.json({ message: 'Password changed. Please sign in again on all devices.' })
  })
  router.patch('/auth/profile', authenticate, csrf, async (req, res) => {
    const input = z.object({ name: z.string().trim().min(1).max(100), about: z.string().max(2000), jobTitle: z.string().max(100), photo: z.string().max(2800000) }).strict().parse(req.body)
    input.photo = await storePhoto(req.user.id, input.photo)
    await userRef(req.user.id).update(input)
    await firebase.auth.updateUser(req.user.id, { displayName: input.name })
    res.json({ user: publicUser(await accountByUid(req.user.id)) })
  })
  return { router, authenticate, csrf, admin, reauthenticate }
}
