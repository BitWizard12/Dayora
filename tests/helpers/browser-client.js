import { createHash } from 'node:crypto'

// Each scenario represents an independent client. Keep the real login limiter
// enabled instead of exhausting one loopback IP across the whole browser suite.
// The emulator-only fixture trusts the single local Vite proxy hop.
export async function isolateLoginClient(context, title) {
  const bytes = createHash('sha256').update(title).digest()
  const address = `10.${bytes[0]}.${bytes[1]}.${bytes[2]}`
  await context.route('**/api/auth/login', (route) => route.continue({ headers: { ...route.request().headers(), 'X-Forwarded-For': address } }))
}
