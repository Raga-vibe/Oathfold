import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Assets must load relative to the page, not from the domain root.
  // GitHub Pages serves the site at /Oathfold/, so absolute /assets
  // paths 404 there and the page renders blank. A relative base works
  // on both Pages and Vercel, which serves from the root.
  base: './',
  plugins: [react()],
  // Unit tests live in src/. The Playwright end-to-end specs in tests/e2e are
  // run by `npx playwright test` (see playwright.config.ts), not by vitest.
  test: {
    include: ['src/**/*.test.ts'],
  },
})
