import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'
export default defineConfig({ ...base, testIgnore: [], testMatch: ['**/phase5.spec.js', '**/dayora-refinement.spec.js'], timeout: 120000,
  webServer: [
    { command: 'node tests/helpers/browser-server.js', url: 'http://127.0.0.1:3101/api/health/ready', reuseExistingServer: false, timeout: 60000 },
    { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false, env: { DAYORA_BROWSER_API_PORT: '3101' } },
  ],
})
