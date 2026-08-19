import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { clearUser, seedFixtures } from './fixtures'

/**
 * The complete student journey, end to end:
 * sign in → profile → discovery → match → detail → save → application →
 * checklist → deadlines → calendar.
 *
 * Everything it asserts is a promise the product makes, so a failure here is a
 * broken promise rather than a cosmetic regression.
 */

const EMAIL = 'e2e-student@example.com'

/**
 * One browser context for the whole journey. Playwright isolates each test in a
 * fresh context by default, which would sign the student out between steps —
 * and this suite is deliberately one continuous session, the way a real student
 * would use it.
 */
let context: BrowserContext
let page: Page

test.beforeAll(async ({ browser }) => {
  await clearUser(EMAIL)
  await seedFixtures()
  context = await browser.newContext()
  page = await context.newPage()
})

test.afterAll(async () => {
  await context?.close()
  await clearUser(EMAIL)
})

test.describe.configure({ mode: 'serial' })

test('a student can sign in, build a profile, and reach a real match', async () => {
  // ── Sign in ───────────────────────────────────────────────────────────────
  await page.goto('/signin')
  await expect(page.getByRole('heading', { name: 'Sign in to Lumen' })).toBeVisible()

  await page.getByLabel('Email address').fill(EMAIL)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL('**/dashboard')

  // A brand-new student sees a real next action, not a blank screen.
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/)
  await expect(page.getByText('No applications started yet')).toBeVisible()

  // ── Profile ───────────────────────────────────────────────────────────────
  await page.goto('/profile')
  await page.getByLabel('Date of birth').fill('2009-06-15') // 16 at the time of writing
  await page.getByLabel('Country', { exact: true }).fill('GB')
  await page.getByLabel('City').fill('Leeds')
  await page.getByLabel('Interests and subjects').fill('molecular biology')
  await page.getByLabel('Directions you are curious about').fill('medicine')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Saved. Your matches will update straight away.')).toBeVisible()

  // Completeness reflects what was just entered.
  await page.reload()
  await expect(page.getByRole('meter', { name: 'Profile completeness' })).toBeVisible()
})

test('discovery scores the eligible fixture and gates the ineligible one', async () => {
  await page.goto('/discover?q=research')

  const eligible = page.getByRole('article').filter({ hasText: 'TEST FIXTURE — Summer Research Placement' })
  await expect(eligible).toBeVisible()

  // The match badge carries a score AND its confidence — never a bare number.
  await expect(eligible.getByText(/Match · (high|medium|low)/)).toBeVisible()
  // The subject reason is grounded in the student's own stated interest.
  await expect(eligible.getByText(/molecular biology/i)).toBeVisible()

  // The ineligible fixture is gated out of the default results entirely.
  await expect(page.getByText('TEST FIXTURE — Graduate Fellowship')).toHaveCount(0)

  // …and is reachable, clearly labelled, behind the explicit toggle.
  await page.getByRole('link', { name: /Show \d+ you are not eligible for/ }).click()
  const ineligible = page.getByRole('article').filter({ hasText: 'TEST FIXTURE — Graduate Fellowship' })
  await expect(ineligible.getByText('Not eligible')).toBeVisible()
  await expect(ineligible.getByText(/open to ages 22–30|open to ages 22-30/i)).toBeVisible()
})

test('the detail page explains itself and never fabricates a missing fact', async () => {
  await page.goto('/opportunity/test-fixture-eligible')

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Summer Research Placement')
  await expect(page.getByText(/Verified ·/).first()).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Why this matches you' })).toBeVisible()

  // Application deadline and programme start are listed separately, never merged.
  await expect(page.getByText('Application deadline', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Programme starts', { exact: true }).first()).toBeVisible()

  // Benefits carry their tier label; the organiser's claim stays attributed.
  await expect(page.getByText('Stated by the organiser').first()).toBeVisible()
  await expect(page.getByText('Lumen’s interpretation').first()).toBeVisible()

  // The worth assessment is present and is labelled as interpretation.
  await expect(page.getByRole('heading', { name: 'Is it worth your time?' })).toBeVisible()

  // Requirements are shown with the source's own wording.
  await expect(page.getByText('Two letters of recommendation', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/Applicants must submit two letters of recommendation/).first()).toBeVisible()

  // Provenance is offered for the reader, not hidden.
  await expect(page.getByRole('heading', { name: 'Where this came from' })).toBeVisible()
})

test('starting an application builds a checklist ordered by lead time', async () => {
  await page.goto('/opportunity/test-fixture-eligible')
  await page.getByRole('button', { name: 'Start application' }).click()
  await page.waitForURL('**/applications')

  await expect(page.getByRole('heading', { name: 'Your applications' })).toBeVisible()

  const steps = page.getByRole('checkbox')
  await expect(steps.first()).toBeVisible()

  // The recommendation letter depends on another human replying, so it is the
  // first thing the student meets — not the last.
  const labels = await steps.allTextContents()
  expect(labels.length).toBeGreaterThan(0)
  expect(labels[0]!.toLowerCase()).toContain('recommendation')
  expect(labels.some((l) => /transcript/i.test(l))).toBe(true)
  expect(labels.some((l) => /statement/i.test(l))).toBe(true)
  // Submitting is always last.
  expect(labels[labels.length - 1]!.toLowerCase()).toContain('submit')

  // Ticking a step is a form post, so it works whether or not React has hydrated.
  await expect(steps.first()).toHaveAttribute('aria-checked', 'false')
  await steps.first().click()
  await expect(steps.first()).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('meter').first()).toBeVisible()
})

test('the calendar separates deadlines from programme dates', async () => {
  await page.goto('/calendar')
  await expect(page.getByRole('heading', { name: 'What’s coming up' })).toBeVisible()

  await expect(page.getByText('Application deadline').first()).toBeVisible()
  await expect(page.getByText('Programme starts').first()).toBeVisible()
  // Programme dates are explicitly marked as not something to apply by.
  await expect(page.getByText('· not something to apply by').first()).toBeVisible()
})

test('discovery states plainly that live search is unconfigured rather than showing nothing', async () => {
  // No BRAVE_SEARCH_API_KEY is set in the test environment.
  await page.goto('/discover?q=research')
  await expect(page.getByText('Live discovery is not configured').first()).toBeVisible()
})

test('the interface is keyboard reachable and announces its landmarks', async () => {
  await page.goto('/dashboard')

  // The skip link is the first thing a keyboard user reaches.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()

  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
})

test('mobile layout swaps the rail for a bottom bar', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard')

  const navs = page.getByRole('navigation', { name: 'Main' })
  await expect(navs.last()).toBeVisible()

  // The page must never scroll sideways on a phone.
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(overflows).toBe(false)
})

test('comparison lines up saved opportunities and never invents a missing value', async () => {
  await page.setViewportSize({ width: 1280, height: 900 })

  // Save the second fixture so there are two things to compare.
  await page.goto('/discover?q=research&ineligible=1')
  const ineligibleCard = page.getByRole('article').filter({ hasText: 'TEST FIXTURE — Graduate Fellowship' })
  await ineligibleCard.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(ineligibleCard.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()

  await page.goto('/compare')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('side by side')

  // Both columns are present, and the ineligible one says so rather than
  // showing a score a student could act on.
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Not eligible' })).toBeVisible()

  // A cost the source never stated stays "Not stated" — never defaulted to free.
  await expect(page.getByRole('cell', { name: 'Not stated', exact: true }).first()).toBeVisible()

  // The assessment is labelled as interpretation, not presented as fact.
  await expect(page.getByText('Lumen’s interpretation').first()).toBeVisible()
})
