import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: '**/phase5.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4173', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, trace: 'retain-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode regression --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
})
