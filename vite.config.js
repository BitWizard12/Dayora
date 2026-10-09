import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { apiOrigin } from './scripts/deployment-config.mjs'
import { readFileSync } from 'node:fs'

import { validatePublicEnvironment } from './src/services/publicEnvironment.js'
export { validatePublicEnvironment } from './src/services/publicEnvironment.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), { name: 'dayora-public-environment', configResolved(config) {
    const env = loadEnv(config.mode, config.root)
    validatePublicEnvironment(env, config)
    if (config.command !== 'build') return
    const origin = apiOrigin(env.VITE_API_URL)
    const deployment = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
    const csp = deployment.headers.flatMap((entry) => entry.headers).find((header) => header.key === 'Content-Security-Policy').value
    if (origin && !csp.split(';').find((directive) => directive.trim().startsWith('connect-src '))?.trim().split(/\s+/).includes(origin)) throw new Error('API origin is missing from Vercel CSP. Run npm run deployment:configure before deploying.')
  } }],
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  preview: { proxy: { '/api': process.env.DAYORA_BROWSER_API_PORT === '3101' ? 'http://127.0.0.1:3101' : 'http://127.0.0.1:3001' } },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'timezone-vendor', test: /node_modules[\\/](?:@js-temporal[\\/]polyfill|jsbi)[\\/]/, priority: 20 }, { name: 'firebase-auth-vendor', test: /node_modules[\\/](?:firebase|@firebase)[\\/]/, priority: 15 }],
        },
      },
    },
  },
})
