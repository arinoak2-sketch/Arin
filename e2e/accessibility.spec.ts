import AxeBuilder from '@axe-core/playwright'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { clearUser, seedFixtures, setRole } from './fixtures'

/**
 * Machine-checked accessibility, against WCAG 2.1 A and AA.
 *
 * docs/03-design-system.md claims strong accessibility. Claims about contrast,
 * labelling and roles are exactly the kind that quietly stop being true, so
 * they are asserted here rather than asserted in a document.
 *
 * Both themes are checked: a palette that passes in light and fails in dark is
 * a palette that fails.
 */

const EMAIL = 'a11y-student@example.com'

let context: BrowserContext
let page: Page

test.beforeAll(async ({ browser }) => {
  await clearUser(EMAIL)
  await seedFixtures()
  context = await browser.newContext()
  page = await context.newPage()

  await page.goto('/signin')
  await page.getByLabel('Email address').fill(EMAIL)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL('**/onboarding**')

  // Get through onboarding so the signed-in pages have real content to audit.
  await page.getByLabel('Date of birth').fill('2009-06-15')
  await page.getByLabel('Country', { exact: true }).fill('GB')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL('**/onboarding?step=interests')
  await page.getByLabel('Subjects and interests').fill('molecular biology')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL('**/onboarding?step=practicalities')
  await page.getByRole('button', { name: 'Skip this step' }).click()
  await page.waitForURL('**/onboarding?step=direction')
  await page.getByRole('button', { name: 'Finish' }).click()
  await page.waitForURL('**/dashboard')

  // One saved and one started application, so the tracker is not empty.
  await page.goto('/opportunity/test-fixture-eligible')
  await page.getByRole('button', { name: 'Start application' }).click()
  await page.waitForURL('**/applications')
  await page.goto('/discover?q=research&ineligible=1')
  const card = page.getByRole('article').filter({ hasText: 'Graduate Fellowship' })
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()
})

test.afterAll(async () => {
  await context?.close()
  await clearUser(EMAIL)
})

test.describe.configure({ mode: 'serial' })

const PAGES: Array<{ name: string; path: string }> = [
  { name: 'discovery', path: '/discover?q=research' },
  { name: 'opportunity detail', path: '/opportunity/test-fixture-eligible' },
  { name: 'applications', path: '/applications' },
  { name: 'calendar', path: '/calendar' },
  { name: 'comparison', path: '/compare' },
  { name: 'profile', path: '/profile' },
  { name: 'dashboard', path: '/dashboard' },
]

/**
 * The admin queue is audited too, and it is the page most likely to drift:
 * it is built for one person, so nobody complains when a control there is
 * unlabelled. The role is granted for this check and taken back afterwards so
 * no other test sees an admin.
 */
test('the review queue is accessible', async () => {
  await setRole(EMAIL, 'ADMIN')
  try {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible()
    // The URL field must be reachable by its label, not just by placeholder.
    await expect(page.getByLabel('Address of the opportunity page')).toBeVisible()
    const results = await audit(page)
    if (results.violations.length > 0) {
      console.log(
        '\nadmin violations:\n' +
          results.violations.map((v) => `  [${v.impact}] ${v.id}: ${v.help}`).join('\n'),
      )
    }
    expect(results.violations).toEqual([])
  } finally {
    await setRole(EMAIL, 'STUDENT')
  }
})

async function audit(target: Page) {
  return new AxeBuilder({ page: target }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
}

for (const { name, path } of PAGES) {
  test(`${name} has no WCAG A or AA violations`, async () => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const results = await audit(page)
    if (results.violations.length > 0) {
      console.log(
        `\n${name} violations:\n` +
          results.violations
            .map((v) => `  [${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.map((n) => n.target.join(' ')).join('\n    ')}`)
            .join('\n'),
      )
    }
    expect(results.violations).toEqual([])
  })
}

test('the dark theme meets the same standard as the light theme', async () => {
  await page.emulateMedia({ colorScheme: 'dark' })

  for (const { name, path } of PAGES) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const results = await audit(page)
    if (results.violations.length > 0) {
      console.log(
        `\n${name} (dark) violations:\n` +
          results.violations.map((v) => `  [${v.impact}] ${v.id}: ${v.help}`).join('\n'),
      )
    }
    expect(results.violations, `${name} in dark theme`).toEqual([])
  }

  await page.emulateMedia({ colorScheme: 'light' })
})

test('the public pages are accessible before sign-in', async ({ browser }) => {
  const anon = await browser.newContext()
  const anonPage = await anon.newPage()

  for (const path of ['/', '/signin']) {
    await anonPage.goto(path)
    await anonPage.waitForLoadState('networkidle')
    const results = await audit(anonPage)
    if (results.violations.length > 0) {
      console.log(
        `\n${path} violations:\n` +
          results.violations.map((v) => `  [${v.impact}] ${v.id}: ${v.help}`).join('\n'),
      )
    }
    expect(results.violations, path).toEqual([])
  }

  await anon.close()
})
