import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Unit tests live in src/. The Playwright end-to-end specs in tests/e2e are
  // run by `npx playwright test` (see playwright.config.ts), not by vitest.
  test: {
    include: ['src/**/*.test.ts'],
  },
})
