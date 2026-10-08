import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { apiOrigin } from './scripts/deployment-config.mjs'
import { readFileSync } from 'node:fs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), { name: 'dayora-public-environment', configResolved(config) {
    const env = loadEnv(config.mode, config.root)
    const publicKeys = ['VITE_API_URL', 'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_AUTH_EMULATOR_URL']
    if (Object.keys(env).some((key) => !publicKeys.includes(key))) throw new Error('Only the documented Firebase public web configuration and API URL may use VITE_* variables.')
    if (env.VITE_FIREBASE_AUTH_EMULATOR_URL && (!(config.mode === 'firebase-test' || config.command === 'serve') || !env.VITE_FIREBASE_PROJECT_ID?.startsWith('demo-') || !/^http:\/\/(127\.0\.0\.1|localhost):9099$/.test(env.VITE_FIREBASE_AUTH_EMULATOR_URL))) throw new Error('Firebase emulators require explicit localhost demo configuration and are refused in normal production builds.')
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
