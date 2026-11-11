import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'

export default defineConfig({
  ...base,
  testMatch: ['**/voice.spec.js', '**/design-shell.spec.js'],
  testIgnore: [],
  use: { ...base.use, baseURL: 'http://127.0.0.1:4178' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4178 --strictPort', url: 'http://127.0.0.1:4178', reuseExistingServer: true },
})
