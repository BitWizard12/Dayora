import { ApiError } from './errors.js'

async function request(config, resource, options, fetcher) {
  const base = config.FIREBASE_AUTH_EMULATOR_HOST ? `http://${config.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1` : 'https://identitytoolkit.googleapis.com/v1'
  let response, result
  try {
    response = await fetcher(`${base}/${resource}?key=${encodeURIComponent(config.FIREBASE_WEB_API_KEY)}`, { ...options, signal: AbortSignal.timeout(10000) })
    result = await response.json()
  } catch { throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable. Please try again.') }
  if (!response.ok) {
    const message = result.error?.message || ''
    const reasons = (result.error?.details || []).map((detail) => detail.reason || '').join(' ')
    if (response.status === 429) throw new ApiError(429, 'AUTH_RATE_LIMITED', 'Too many authentication attempts. Please try again later.')
    if (response.status >= 500) throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable. Please try again.')
    if (/API[_ ]KEY|API key|PROJECT_NOT_FOUND|CONFIGURATION_NOT_FOUND|SERVICE_DISABLED/.test(`${message} ${reasons}`) || response.status === 403 || resource === 'projects') {
      throw new ApiError(503, 'AUTH_CONFIGURATION_ERROR', 'Authentication service configuration is unavailable. Contact the administrator.')
    }
    const login = resource === 'accounts:signInWithPassword'
    throw new ApiError(login ? 401 : 400, login ? 'LOGIN_FAILED' : 'INVALID_AUTH_ACTION', login ? 'Unable to sign in. Check your credentials and email verification.' : 'This authentication action is invalid, expired or unavailable. Request a new link.')
  }
  return result
}

export function firebaseAuthRequest(config, action, body, fetcher = fetch) {
  return request(config, `accounts:${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, fetcher)
}

// Admin credentials do not validate the separate Web API key used to consume action codes.
// The public config's projectId is a numeric project number, not FIREBASE_PROJECT_ID.
export function verifyFirebaseWebConfig(config, fetcher = fetch) {
  return request(config, 'projects', { method: 'GET' }, fetcher)
}
