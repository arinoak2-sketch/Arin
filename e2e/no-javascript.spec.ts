import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { clearUser, seedFixtures } from './fixtures'

/**
 * The core journey with JavaScript switched off entirely.
 *
 * This suite exists because the same bug was fixed four times: a control that
 * looks fine but is a click handler on a component React has not hydrated yet,
 * so an early tap does nothing at all and says nothing about it. Each time it
 * was found by accident. Running with JS disabled turns "does this work before
 * hydration?" from something to remember into something the suite answers.
 *
 * JS off is a stricter bar than pre-hydration — anything passing here is safe
 * in the slow-connection window that real students on real phones live in.
 * Genuinely JS-dependent enhancements (the live-search banner, the optimistic
 * label flip) are expected to be absent, not broken.
 */

const EMAIL = 'nojs-student@example.com'

let context: BrowserContext
let page: Page

test.beforeAll(async ({ browser }) => {
  await clearUser(EMAIL)
  await seedFixtures()
  /*
   * reducedMotion is set for a mechanical reason, not a cosmetic one.
   *
   * Playwright decides an element is clickable once its box is unchanged
   * across two animation frames. A page with scripting disabled stops
   * producing frames the moment it goes idle — so the 180ms entrance
   * animation on the card list ticked a few frames, finished, and then the
   * page went quiet with the check still waiting. It never resolved, and the
   * click timed out after 20s having found a perfectly good button.
   *
   * Reduced motion switches that animation off (see globals.css), so the box
   * is settled from the first paint. It is also the honest setting for this
   * suite: someone browsing without JavaScript is on a constrained device,
   * where reduced motion is more common, not less. The animated path stays
   * covered by the journey and accessibility suites, which run with motion on.
   */
  context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce' })
  page = await context.newPage()
})

test.afterAll(async () => {
  await context?.close()
  await clearUser(EMAIL)
})

test.describe.configure({ mode: 'serial' })

test('a student can sign in without JavaScript', async () => {
  await page.goto('/signin')
  await expect(page.getByRole('heading', { name: 'Sign in to Lumen' })).toBeVisible()

  await page.getByLabel('Email address').fill(EMAIL)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL('**/onboarding**')
})

test('onboarding is completable without JavaScript', async () => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('First, the basics')

  await page.getByLabel('Date of birth').fill('2009-06-15')
  await page.getByLabel('Country', { exact: true }).fill('GB')
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.waitForURL('**/onboarding?step=interests')
  await page.getByLabel('Subjects and interests').fill('molecular biology')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Skipping is a separate form, so it must work on its own too.
  await page.waitForURL('**/onboarding?step=practicalities')
  await page.getByRole('button', { name: 'Skip this step' }).click()

  await page.waitForURL('**/onboarding?step=direction')
  await page.getByRole('button', { name: 'Finish' }).click()
  await page.waitForURL('**/dashboard')
})

test('search works without JavaScript', async () => {
  await page.goto('/discover')
  await page.getByLabel(/Describe what you are looking for/i).fill('research')
  await page.getByRole('button', { name: 'Search' }).click()

  await page.waitForURL(/\/discover\?.*q=research/)
  await expect(page.getByRole('article').filter({ hasText: 'Summer Research Placement' })).toBeVisible()
})

test('saving works without JavaScript', async () => {
  await page.goto('/discover?q=research')
  const card = page.getByRole('article').filter({ hasText: 'Summer Research Placement' })

  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('article').filter({ hasText: 'Summer Research Placement' }).getByRole('button', { name: 'Saved', exact: true }),
  ).toBeVisible()
})

test('starting an application works without JavaScript', async () => {
  await page.goto('/opportunity/test-fixture-eligible')
  await page.getByRole('button', { name: 'Start application' }).click()
  await page.waitForURL('**/applications')
  await expect(page.getByRole('heading', { name: 'Your applications' })).toBeVisible()
})

test('ticking a checklist step works without JavaScript', async () => {
  await page.goto('/applications')
  const steps = page.getByRole('checkbox')
  await expect(steps.first()).toHaveAttribute('aria-checked', 'false')

  await steps.first().click()
  await expect(page.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'true')
})

test('changing an application status works without JavaScript', async () => {
  await page.goto('/applications')
  await page.getByLabel('Application status').selectOption('SUBMITTED')
  await page.getByRole('button', { name: 'Update status' }).click()

  await expect(page.getByLabel('Application status')).toHaveValue('SUBMITTED')
})

test('saving the profile works without JavaScript', async () => {
  await page.goto('/profile')
  await page.getByLabel('City').fill('Leeds')
  await page.getByRole('button', { name: 'Save profile' }).click()

  await page.goto('/profile')
  await expect(page.getByLabel('City')).toHaveValue('Leeds')
})

test('reporting a problem works without JavaScript', async () => {
  await page.goto('/opportunity/test-fixture-eligible')
  // A native <details> disclosure, so it opens with no script at all.
  await page.getByText(/Report a problem with this listing/i).click()

  await page.getByRole('radio', { name: 'The deadline is wrong' }).check()
  await page.getByRole('button', { name: 'Send report' }).click()

  await expect(page.getByText(/marked as needing review/i)).toBeVisible()
})

test('every page renders its content without JavaScript', async () => {
  const pages: Array<[string, RegExp]> = [
    ['/dashboard', /Good (morning|afternoon|evening)/],
    ['/discover', /Find something worth your time/],
    ['/applications', /Your applications/],
    ['/calendar', /What’s coming up/],
    ['/compare', /Compare|side by side/],
    ['/profile', /Your profile/],
  ]

  for (const [path, heading] of pages) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }), path).toContainText(heading)
  }
})
