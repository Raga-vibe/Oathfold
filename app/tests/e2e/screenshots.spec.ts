// Screenshot capture (Commit 3). Not part of the default test run:
//
//   CAPTURE_SCREENSHOTS=1 npx playwright test tests/e2e/screenshots.spec.ts
//
// Writes desktop (1440x900) and mobile (390x844) PNGs for Landing, Dashboard,
// Create, Record detail and Live chain into docs/assets/screenshots/.
// Everything shown is a DEMO FIXTURE or a read-only chain check; no wallet and
// no live send are involved.
import { test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const OUT = path.resolve(process.cwd(), '..', 'docs', 'assets', 'screenshots')

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const

test.skip(!process.env.CAPTURE_SCREENSHOTS, 'set CAPTURE_SCREENSHOTS=1 to regenerate the screenshots')

test('capture page screenshots', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    // Let the mount-time hub read settle so the status strip is not captured
    // mid-flight. A failed or mismatched read still renders a named state.
    const settle = () => page.waitForTimeout(3500)
    const shot = (name: string) =>
      page.screenshot({ path: path.join(OUT, `${name}-${vp.name}-${vp.width}.png`) })

    await page.goto('/')
    await page.waitForSelector('.steps-strip')
    await settle()
    await shot('landing')

    await page.goto('/#/dashboard')
    await page.waitForSelector('.record-table')
    await settle()
    await shot('dashboard')

    await page.goto('/#/create')
    await page.waitForSelector('#title')
    await settle()
    await shot('create')

    await page.goto('/#/dashboard')
    const judged = page.locator('.record-table tbody tr', { hasText: 'Land the first live promise' })
    await judged.getByRole('link', { name: 'Open' }).click()
    await page.waitForSelector('.timeline')
    await settle()
    await shot('record-detail')

    await page.goto('/#/live')
    await page.waitForSelector('.card')
    // Give the hub read and the endpoint lookup a moment to settle so the panel
    // is not captured mid-flight. A failed read still renders a named state.
    await page.waitForTimeout(4000)
    await shot('live-chain')
  }
})