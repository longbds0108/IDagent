import { defineConfig, devices } from '@playwright/test'

/** Critical public flows. Uses whatever .env.local points at (mainnet or the local demo node). */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3200' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'pnpm start -p 3200', url: 'http://localhost:3200/api/issuers', reuseExistingServer: true, timeout: 60_000 },
})
