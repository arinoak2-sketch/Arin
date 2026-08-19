import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { clearUser, seedFixtures } from '../fixtures'

/** Minimal capture of the comparison screen. Not an assertion suite. */

const EMAIL = 'cmp-student@example.com'
const OUT = '/tmp/claude-0/-home-user-Arin/d6478b27-6549-5dee-89ad-5efa57958e8e/scratchpad/shots'

let context: BrowserContext
let page: Page

test.beforeAll(async ({ browser }) => {
  await clearUser(EMAIL)
  await seedFixtures()
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  page = await context.newPage()
})

test.afterAll(async () => {
  await context?.close()
  await clearUser(EMAIL)
})

test('capture compare', async () => {
  test.setTimeout(120_000)

  await page.goto('/signin')
  await page.getByLabel('Email address').fill(EMAIL)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL('**/dashboard')

  await page.goto('/profile')
  await page.getByLabel('Date of birth').fill('2009-06-15')
  await page.getByLabel('Country', { exact: true }).fill('GB')
  await page.getByLabel('Interests and subjects').fill('molecular biology')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await page.waitForTimeout(900)

  // Save both, waiting for each to confirm. Clicking straight through races
  // the revalidation that follows the first save.
  for (const title of ['Summer Research Placement', 'Graduate Fellowship']) {
    await page.goto('/discover?q=research&ineligible=1')
    const card = page.getByRole('article').filter({ hasText: title })
    await card.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(card.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()
  }

  await page.goto('/compare')
  // In dev, CSS is injected after first paint; screenshotting before that
  // captures unstyled HTML.
  await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/10-compare.png` })
})
