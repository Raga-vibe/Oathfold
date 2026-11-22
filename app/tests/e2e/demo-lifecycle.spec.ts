// Demo-lifecycle end-to-end tests (Commit 3).
//
// Covers exactly the practice-record journey, with no live send and no wallet:
//   1. landing loads, with the live X Layer read
//   2. dashboard shows all six statuses
//   3. create a practice record
//   4. open that record (sealed state)
//   5. open the pre-built Opened record, which is what a reveal looks like in
//      the UI (the app has no separate reveal button; a real reveal is the
//      holder-key path and lands as an Opened record)
//   6. build a verdict draft in the reviewer console
//   7. one click fills and saves a sample practice record
//
// Every promise here is a DEMO FIXTURE built in the browser. Nothing on this
// page talks to a wallet or sends a transaction.
import { test, expect } from '@playwright/test'

// First request to the Vite dev server triggers dependency optimisation, which
// can take longer than a cold assertion timeout. Warm it once per worker.
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage()
  await page.goto('/', { timeout: 60_000 })
  await page.waitForSelector('h1', { timeout: 60_000 })
  await page.close()
})

test('landing loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('Seal the promise before the result.')
  await expect(page.locator('.steps-strip')).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Make a promise' }).first()).toBeVisible()
})

test('landing shows the live X Layer read', async ({ page }) => {
  await page.goto('/')
  const card = page.locator('.network-card')
  await expect(card.getByRole('heading', { name: 'Read from X Layer just now' })).toBeVisible()
  await expect(card.locator('.badge')).toBeVisible()
})

test('dashboard shows all six statuses', async ({ page }) => {
  await page.goto('/#/dashboard')
  await expect(page.locator('.record-table tbody tr')).toHaveCount(6)
  const tabs = page.getByRole('tablist').getByRole('button')
  await expect(tabs).toHaveCount(7) // All + six statuses
  for (const label of ['Sealed', 'Due', 'Opened', 'Ruled', 'Still locked', 'Broken']) {
    await expect(page.getByRole('tablist').getByRole('button', { name: new RegExp(`^${label} \\(1\\)$`) })).toBeVisible()
  }
})

test('create a practice record and open it', async ({ page }) => {
  await page.goto('/#/create')
  await page.fill('#title', 'E2E practice promise')
  await page.fill('#body', 'I will verify the practice record lifecycle end to end.')
  await page.fill('#open', '2030-01-01T10:00')
  await page.fill('#author', '#1@2.344')
  await page.fill('#judge', '#1@2.344')
  await page.getByRole('button', { name: 'Save as a practice record instead' }).click()

  await expect(page.getByText('Saved as a practice record.')).toBeVisible()
  await page.getByRole('link', { name: 'Open the demo record' }).click()

  await expect(page).toHaveURL(/#\/record\//)
  await expect(page.locator('h1')).toHaveText('E2E practice promise')
  await expect(page.getByText('Sealed. The promise text is hidden until it is opened.')).toBeVisible()
})

test('an opened practice record shows its promise text (the reveal state)', async ({ page }) => {
  await page.goto('/#/dashboard')
  const row = page.locator('.record-table tbody tr', { hasText: 'Finish the judge page' })
  await row.getByRole('link', { name: 'Open' }).click()

  await expect(page).toHaveURL(/#\/record\//)
  await expect(page.locator('h1')).toHaveText('Finish the judge page')
  await expect(page.getByText('I will finish the judge page before the open date.')).toBeVisible()
  await expect(page.getByText('Opened. Everyone can read it.')).toBeVisible()
})

test('one click fills and saves a sample practice record', async ({ page }) => {
  await page.goto('/#/create')
  await expect(page.locator('.sample-bar')).toBeVisible()
  await page.getByRole('button', { name: 'Try a sample promise' }).click()

  await expect(page.locator('#title')).toHaveValue('Ship the v1 demo before Friday')
  await expect(page.locator('#judge')).toHaveValue('#1@2.344')
  await expect(page.getByText('Saved as a practice record.')).toBeVisible()
})

test('build a verdict draft in the reviewer console', async ({ page }) => {
  await page.goto('/#/review')
  const row = page.locator('.queue-row', { hasText: 'Finish the judge page' })
  await row.getByRole('button', { name: 'Rule' }).click()

  await page.selectOption('#outcome', 'hit')
  await page.fill('#reason', 'Checked against the public release.')
  await page.fill('#vbody', 'Hit. The release tag exists.')
  await page.fill('#sname', 'github-release')
  await page.fill('#svalue', 'v1.0.0')
  await page.getByRole('button', { name: 'Build ruling draft' }).click()

  await expect(page.getByText('Draft ready (not sent).')).toBeVisible()
  const draft = page.locator('pre.code-pane')
  await expect(draft).toContainText('Ruling draft (NOT SENT)')
  await expect(draft).toContainText('Ruling: hit')
  await expect(draft).toContainText('Promise: ')
})
