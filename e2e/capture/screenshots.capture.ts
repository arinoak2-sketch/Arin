import { test, type BrowserContext, type Page } from '@playwright/test'
import { clearUser, seedFixtures } from '../fixtures'

/** Captures the real UI for review. Not an assertion suite. */

const EMAIL = 'shots-student@example.com'
const OUT = '/tmp/claude-0/-home-user-Arin/d6478b27-6549-5dee-89ad-5efa57958e8e/scratchpad/shots'

let context: BrowserContext
let page: Page

test.beforeAll(async ({ browser }) => {
  await clearUser(EMAIL)
  await seedFixtures()
  context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 })
  page = await context.newPage()
})

test.afterAll(async () => {
  await context?.close()
  await clearUser(EMAIL)
})

test.describe.configure({ mode: 'serial' })

test('capture', async () => {
  test.setTimeout(240_000)
  await page.goto('/')
  await page.screenshot({ path: `${OUT}/01-landing.png`, fullPage: true })

  await page.goto('/signin')
  await page.getByLabel('Email address').fill(EMAIL)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL('**/dashboard')

  await page.goto('/profile')
  await page.getByLabel('Date of birth').fill('2009-06-15')
  await page.getByLabel('Country', { exact: true }).fill('GB')
  await page.getByLabel('City').fill('Leeds')
  await page.getByLabel('Interests and subjects').fill('molecular biology')
  await page.getByLabel('Directions you are curious about').fill('medicine')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await page.waitForTimeout(800)

  await page.goto('/discover?q=research')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/02-discover.png`, fullPage: true })

  await page.goto('/opportunity/test-fixture-eligible')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/03-opportunity.png`, fullPage: true })

  await page.getByRole('button', { name: 'Start application' }).click()
  await page.waitForURL('**/applications')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/04-applications.png`, fullPage: true })

  await page.goto('/dashboard')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/05-dashboard.png`, fullPage: true })

  await page.goto('/discover?q=research&ineligible=1')
  await page.waitForTimeout(800)
  const other = page.getByRole('article').filter({ hasText: 'Graduate Fellowship' })
  await other.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(600)
  await page.goto('/compare')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/10-compare.png`, fullPage: true })

  await page.goto('/calendar')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/06-calendar.png`, fullPage: true })

  // Dark theme, same pages, to prove both palettes are designed.
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/discover?q=research')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/07-discover-dark.png`, fullPage: true })

  // Mobile.
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/08-mobile-dashboard.png`, fullPage: true })
  await page.goto('/opportunity/test-fixture-eligible')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/09-mobile-opportunity.png`, fullPage: true })
})
