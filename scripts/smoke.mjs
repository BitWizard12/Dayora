import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

export function smokeConfig(env = process.env) {
  const origin = (value) => {
    const url = new URL(value)
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !(url.protocol === 'https:' || env.SMOKE_ALLOW_HTTP === 'true' && env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Use exact HTTPS deployment origins. HTTP is allowed only for explicitly enabled localhost tests.')
    return url.origin
  }
  if (!!env.SMOKE_EMAIL !== !!env.SMOKE_PASSWORD) throw new Error('Supply both SMOKE_EMAIL and SMOKE_PASSWORD for a dedicated verified test account.')
  if (env.SMOKE_CRUD === 'true' && (!env.SMOKE_EMAIL || env.SMOKE_CONFIRM !== 'USE_EMPTY_TEST_WORKSPACE')) throw new Error('CRUD requires test credentials and SMOKE_CONFIRM=USE_EMPTY_TEST_WORKSPACE.')
  if (env.SMOKE_SIGNUP === 'true' && (!env.SMOKE_SIGNUP_EMAIL || !env.SMOKE_SIGNUP_PASSWORD || env.SMOKE_SIGNUP_CONFIRM !== 'CREATE_TEST_ACCOUNT')) throw new Error('Signup requires separate test credentials and SMOKE_SIGNUP_CONFIRM=CREATE_TEST_ACCOUNT.')
  return { api: origin(env.SMOKE_API_URL), frontend: origin(env.SMOKE_FRONTEND_URL), email: env.SMOKE_EMAIL, password: env.SMOKE_PASSWORD,
    crud: env.SMOKE_CRUD === 'true', signup: env.SMOKE_SIGNUP === 'true', signupEmail: env.SMOKE_SIGNUP_EMAIL, signupPassword: env.SMOKE_SIGNUP_PASSWORD }
}

export async function runSmoke(config, { fetcher = fetch, report = console.info } = {}) {
  let cookie = '', csrf = '', authenticated = false, projectId, taskId
  const check = (condition, message) => { if (!condition) throw new Error(message) }
  const request = async (path, { method = 'GET', body, status = 200 } = {}) => {
    const response = await fetcher(`${config.api}/api${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Origin: config.frontend, ...(cookie ? { Cookie: cookie } : {}), ...(csrf && method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
    check(response.status === status, `Unexpected status for ${method} ${path.split('?')[0]}: expected ${status}, received ${response.status}.`)
    const cookies = response.headers.getSetCookie()
    if (cookies.length) {
      cookie = cookies.map((value) => value.split(';')[0]).join('; ')
      if (path === '/auth/login') {
        check(cookies.every((value) => /HttpOnly/i.test(value) && /SameSite=(Lax|Strict|None)/i.test(value) && !/;\s*Domain=/i.test(value)), 'Session cookie attributes failed.')
        if (config.api.startsWith('https:')) check(cookies.some((value) => value.startsWith('__Host-dayora=') && /;\s*Secure/i.test(value)), 'Production Secure cookie missing.')
      }
    }
    if (path === '/auth/login') check(response.headers.get('access-control-allow-origin') === config.frontend && response.headers.get('access-control-allow-credentials') === 'true', 'Credentialed CORS failed.')
    return response.json()
  }
  await request('/health/live'); report('PASS backend liveness')
  await request('/health/ready'); report('PASS backend readiness')
  const frontend = await fetcher(config.frontend, { redirect: 'error', signal: AbortSignal.timeout(15000) })
  check(frontend.ok && (await frontend.text()).includes('Dayora'), 'Frontend is unreachable or missing Dayora branding.')
  if (config.frontend.startsWith('https:')) {
    const policy = frontend.headers.get('content-security-policy') || ''
    check(policy.includes("script-src 'self'") && policy.includes("frame-ancestors 'none'"), 'Frontend CSP missing required protections.')
    const destinations = policy.split(';').find((directive) => directive.trim().startsWith('connect-src '))?.trim().split(/\s+/) || []
    check(destinations.includes(config.api) || config.api === config.frontend && destinations.includes("'self'"), 'Frontend CSP blocks the configured API.')
    check(!destinations.includes('https:') && frontend.headers.has('strict-transport-security'), 'Frontend security headers require review.')
  }
  report('PASS frontend reachability/security headers')
  await request('/workspace', { status: 401 }); await request('/admin/overview', { status: 401 }); report('PASS unauthenticated endpoint rejection')
  if (config.signup) { await request('/auth/signup', { method: 'POST', body: { name: 'Dayora deployment test', email: config.signupEmail, password: config.signupPassword }, status: 202 }); report('PASS signup request accepted; account creation/email delivery still require inbox verification') }
  if (!config.email) { report('SKIP authenticated checks: dedicated test credentials were not supplied'); return }
  try {
    const login = await request('/auth/login', { method: 'POST', body: { email: config.email, password: config.password, remember: true } })
    csrf = login.csrf; authenticated = true
    check(login.user?.role === 'user', 'Use a dedicated nonadministrator smoke-test account.')
    const session = await request('/auth/session'); check(session.user.id === login.user.id && session.csrf === csrf, 'Session restore failed.')
    await request('/admin/overview', { status: 403 }); report('PASS login/session/nonadministrator rejection')
    let workspace = await request('/workspace')
    if (config.crud) {
      check(Object.values(workspace.collections).every((rows) => rows.length === 0), 'CRUD refused: dedicated test workspace must be completely empty.')
      const write = async (collection, data) => workspace = await request(`/workspace/${collection}`, { method: 'PUT', body: { revision: workspace.revision, data } })
      projectId = randomUUID(); taskId = randomUUID()
      await write('projects', [{ id: projectId, name: 'Deployment smoke project', description: 'Temporary verification record', status: 'Pending', deadline: '' }])
      await write('tasks', [{ id: taskId, title: 'Deployment smoke task', description: '', status: 'To do', priority: 'Medium', dueDate: '', projectId, position: 0, subtasks: [], assigneeIds: [], assignees: [], comments: 0 }])
      check((await request(`/workspace/tasks/${taskId}`)).record.projectId === projectId, 'Persisted task/project relationship failed.')
      await write('tasks', workspace.collections.tasks.map((task) => ({ ...task, status: 'Done' })))
      check((await request(`/workspace/tasks/${taskId}`)).record.completedAt > 0, 'Task completion persistence failed.')
      // Logout/relogin proves data survives session invalidation.
      await request('/auth/logout', { method: 'POST', body: {} }); cookie = ''; csrf = ''; authenticated = false
      const restored = await request('/auth/login', { method: 'POST', body: { email: config.email, password: config.password } }); csrf = restored.csrf; authenticated = true
      check((await request(`/workspace/projects/${projectId}`)).record.name === 'Deployment smoke project', 'Persistence after login failed.')
      report('PASS project/task create/read/update and persistence after logout/login')
    } else report('SKIP CRUD: explicit empty-workspace confirmation was not supplied')
  } finally {
    if (authenticated) {
      try {
        if (projectId || taskId) {
          let current = await request('/workspace')
          if (taskId) current = await request('/workspace/tasks', { method: 'PUT', body: { revision: current.revision, data: current.collections.tasks.filter((task) => task.id !== taskId) } })
          if (projectId) await request('/workspace/projects', { method: 'PUT', body: { revision: current.revision, data: current.collections.projects.filter((project) => project.id !== projectId) } })
          report('PASS temporary record cleanup')
        }
      } finally { await request('/auth/logout', { method: 'POST', body: {} }); cookie = ''; csrf = ''; await request('/auth/session', { status: 401 }); report('PASS logout invalidation') }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runSmoke(smokeConfig()) }
  catch { console.error('Deployment smoke check failed. Review configuration, health, verified test-account access and server logs. No URLs, credentials or response bodies were logged. If CRUD ran, verify its temporary records were cleaned up.'); process.exitCode = 1 }
}
