import { defineConfig, devices } from '@playwright/test'

// Playwright end-to-end tests for the Oathfold demo lifecycle only. No live
// send is exercised: the tests drive practice (demo fixture) records and chain
// reads, never a wallet transaction. Run with `npx playwright test`.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  // One worker: the tests share the same origin and localStorage demo cache.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } }],
})
