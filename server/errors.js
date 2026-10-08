export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}
export function errorHandler(error, req, res, _next) {
  const status = error.status || (error.name === 'ZodError' ? 400 : 500)
  const code = typeof error.code === 'string' ? error.code : status === 409 ? 'CONFLICT' : status === 400 ? 'INVALID_INPUT' : 'INTERNAL_ERROR'
  if (status >= 500) console.error(JSON.stringify({ event: 'request_error', requestId: req.requestId, name: error.name, code: typeof error.code === 'string' ? error.code : undefined }))
  const safeAuthError = error instanceof ApiError && ['AUTH_CONFIGURATION_ERROR', 'AUTH_UNAVAILABLE'].includes(code)
  res.status(status).json({ error: { code, message: status >= 500 && !safeAuthError ? 'Something went wrong. Please try again.' : error.type === 'entity.parse.failed' ? 'Invalid JSON request.' : error.name === 'ZodError' ? 'Please check the submitted fields.' : error.message, requestId: req.requestId } })
}
