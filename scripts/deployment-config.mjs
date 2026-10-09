import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export function apiOrigin(value) {
  if (!value) return ''
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname) || url.hostname.endsWith('.localhost')) throw new Error('VITE_API_URL must be an exact HTTPS origin with a public hostname and without credentials, path, query or fragment.')
  return url.origin
}

export function configureHeaders(config, origin) {
  const next = structuredClone(config)
  const policy = next.headers.flatMap((entry) => entry.headers).find((header) => header.key === 'Content-Security-Policy')
  policy.value = policy.value.replace(/connect-src[^;]*/, `connect-src 'self'${origin ? ` ${origin}` : ''} https://identitytoolkit.googleapis.com https://securetoken.googleapis.com`)
  policy.value = policy.value.replace(/img-src[^;]*/, `img-src 'self' data: blob:${origin ? ` ${origin}` : ''}`)
  return next
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { loadEnv } = await import('vite')
    const origin = apiOrigin(loadEnv('production', process.cwd()).VITE_API_URL)
    const config = JSON.parse(await readFile('vercel.json', 'utf8'))
    await writeFile('vercel.json', `${JSON.stringify(configureHeaders(config, origin), null, 2)}\n`)
    console.info('Vercel CSP configured for the public API origin. Review and commit vercel.json before deploying.')
  } catch { console.error('Deployment header configuration failed. Set VITE_API_URL to an exact HTTPS origin; no configuration values were logged.'); process.exitCode = 1 }
}
