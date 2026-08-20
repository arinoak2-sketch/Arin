import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { clearUser, grantConsentFor, seedFixtures } from './fixtures'

/**
 * The EU parental-consent gate, driven end to end.
 *
 * This suite exists because the gate is the kind of feature that is easy to
 * build and easy to leave decorative. Branching onboarding to a "waiting for a
 * parent" screen changes only where a form redirects; if the layout check were
 * missing or wrong, the student could type /dashboard and be straight into the
 * product with none of it enforced. So the assertions here are mostly about
 * what a pending account *cannot* reach.
 *
 * Runs with JavaScript disabled, because a 14-year-old on a school Chromebook
 * is exactly the person this flow is for, and a legal control must not depend
 * on hydration.
 */

const EU_MINOR = 'consent-minor@example.com'
const EU_ADULT = 'consent-adult@example.com'

let context: BrowserContext
let page: Page

test.beforeAll(async ({ browser }) => {
  await clearUser(EU_MINOR)
  await clearUser(EU_ADULT)
  await seedFixtures()
  context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce' })
  page = await context.newPage()
})

test.afterAll(async () => {
  await context?.close()
  await clearUser(EU_MINOR)
  await clearUser(EU_ADULT)
})

test.describe.configure({ mode: 'serial' })

async function signIn(email: string) {
  await page.goto('/signin')
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL('**/onboarding**')
}

/** Fills the basics step with a date of birth and country. */
async function submitBasics(dateOfBirth: string, country: string) {
  await page.getByLabel('Date of birth').fill(dateOfBirth)
  await page.getByLabel('Country', { exact: true }).fill(country)
  await page.getByRole('button', { name: 'Continue' }).click()
}

test('an EU 14-year-old is asked for a parent rather than refused', async () => {
  await signIn(EU_MINOR)
  await submitBasics('2012-01-01', 'DE')

  await page.waitForURL(/step=consent/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('grown-up has to agree')
  // The point of the redesign: it explains, rather than saying "not allowed".
  await expect(page.getByText(/under 16 and in the EU/i)).toBeVisible()
})

test('the date of birth already given is not thrown away', async () => {
  // Being sent back to retype it would be the obvious way to make this hostile.
  await page.goto('/onboarding?step=basics')
  await expect(page.getByLabel('Date of birth')).toHaveValue('2012-01-01')
})

test('it refuses the student’s own address as the parent’s', async () => {
  await page.goto('/onboarding?step=consent')
  await page.getByLabel(/parent or guardian/i).fill(EU_MINOR)
  await page.getByRole('button', { name: /ask for permission/i }).click()

  await page.waitForURL(/step=consent/)
  await expect(page.getByRole('alert')).toContainText(/your own address/i)
})

test('a request can be sent to a parent', async () => {
  await page.goto('/onboarding?step=consent')
  await page.getByLabel(/parent or guardian/i).fill('a-parent@example.com')
  await page.getByRole('button', { name: /ask for permission/i }).click()

  await page.waitForURL(/step=consent/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Waiting for a parent')
  await expect(page.getByText('a-parent@example.com')).toBeVisible()
})

test('a pending account cannot reach the product by typing a URL', async () => {
  // The assertion the whole feature rests on.
  for (const path of ['/dashboard', '/discover', '/applications', '/calendar', '/profile', '/compare']) {
    await page.goto(path)
    await expect(page, path).toHaveURL(/step=consent/)
  }
})

test('a pending account cannot export its calendar either', async () => {
  const response = await page.request.get('/api/calendar.ics')
  expect(response.status()).toBe(403)
})

test('granting permission opens the account', async () => {
  await grantConsentFor(EU_MINOR)
  await page.goto('/dashboard')
  await expect(page).not.toHaveURL(/step=consent/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('a 14-year-old outside the EU is never asked', async ({ browser }) => {
  // A fresh context: /signin redirects an already-signed-in visitor straight to
  // the dashboard, so a second student needs their own session, not a new form.
  const other = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce' })
  const otherPage = await other.newPage()
  try {
    await otherPage.goto('/signin')
    await otherPage.getByLabel('Email address').fill(EU_ADULT)
    await otherPage.getByRole('button', { name: 'Continue' }).click()
    await otherPage.waitForURL('**/onboarding**')

    await otherPage.getByLabel('Date of birth').fill('2012-01-01')
    await otherPage.getByLabel('Country', { exact: true }).fill('IN')
    await otherPage.getByRole('button', { name: 'Continue' }).click()

    await otherPage.waitForURL(/step=interests/)
    await expect(otherPage).not.toHaveURL(/step=consent/)
  } finally {
    await other.close()
  }
})
