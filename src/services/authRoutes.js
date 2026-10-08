const views = ['login', 'signup', 'forgot-password', 'reset-password', 'verify-email']

export function parseAuthRoute(hash) {
  const value = hash.replace(/^#/, '')
  const separator = value.indexOf('?')
  const view = separator < 0 ? value : value.slice(0, separator)
  const query = separator < 0 ? '' : value.slice(separator + 1)
  return { view: views.includes(view) ? view : 'login', token: new URLSearchParams(query).get('token') || '' }
}
