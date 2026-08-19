import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { clearUser, seedFixtures } from '../fixtures'

const EMAIL = 'onb-student@example.com'
const OUT = '/tmp/claude-0/-home-user-Arin/d6478b27-6549-5dee-89ad-5efa57958e8e/scratchpad/shots'

let context: BrowserContext
let page: Page

test.beforeAll(async ({ browser }) => {
  await clearUser(EMAIL)
  await seedFixtures()
  context = await browser.newContext({ viewport: { width: 900, height: 1000 } })
  page = await context.newPage()
})

test.afterAll(async () => {
  await context?.close()
  await clearUser(EMAIL)
})

test('capture onboarding', async () => {
  test.setTimeout(120_000)

  await page.goto('/signin')
  await page.getByLabel('Email address').fill(EMAIL)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL('**/onboarding**')
  await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/11-onboarding-1.png` })

  await page.getByLabel('Date of birth').fill('2009-06-15')
  await page.getByLabel('Country', { exact: true }).fill('GB')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL('**/onboarding?step=interests')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/12-onboarding-2.png` })

  await page.getByLabel('Subjects and interests').fill('molecular biology')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL('**/onboarding?step=practicalities')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/13-onboarding-3.png` })

  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
})
