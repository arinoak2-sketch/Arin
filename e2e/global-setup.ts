/**
 * Warms every route before the suites run.
 *
 * The dev server compiles routes on first request, which can take tens of
 * seconds for the heavier pages. Without this the first test to touch a cold
 * route fails on a timeout that looks exactly like a real bug — and did,
 * repeatedly, until this moved out of my shell history and into the config.
 */
import { chromium, type FullConfig } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { clearUser } from './fixtures'

/** Pages reachable without a session. */
const ROUTES = [
  '/',
  '/signin',
  '/onboarding',
  '/dashboard',
  '/discover',
  '/applications',
  '/calendar',
  '/profile',
  '/compare',
  '/opportunity/warm-up-only',
]

/**
 * Route handlers, warmed by POSTing to them unauthenticated — they answer with
 * a redirect to /signin without touching any data, which is all that is needed
 * to make the dev server compile them.
 *
 * These matter more than the pages. A handler compiling in the middle of a form
 * submission left the dev server unable to serve the page it redirected to,
 * failing with an opaque "Unexpected end of JSON input" that looks nothing like
 * a compile problem and cost hours to trace.
 */
const POST_ROUTES = [
  '/api/onboarding/basics',
  '/api/onboarding/interests',
  '/api/onboarding/practicalities',
  '/api/onboarding/direction',
  '/api/onboarding/skip',
  '/api/applications/start',
]

const GET_ROUTES = ['/api/calendar.ics']

/**
 * Pages that only compile their real render path once someone is signed in.
 *
 * Warming them unauthenticated is nearly worthless: they redirect to /signin
 * before rendering anything, so the modules that actually take time — the match
 * cards, the checklist, the calendar grid — stay uncompiled until the first
 * real test hits them and pays 25 seconds for it. That is why every suite used
 * to burn a retry on its own first test and then run clean.
 */
const AUTHENTICATED_ROUTES = [
  '/dashboard',
  '/discover?q=research',
  '/applications',
  '/calendar',
  '/profile',
  '/compare',
  '/admin',
]

const WARM_EMAIL = 'warmup-only@example.com'

/**
 * Signs in once through the real UI and walks the authenticated pages so the
 * dev server compiles them before any assertion depends on the timing.
 *
 * Playwright rather than fetch because sign-in is a server action: driving it
 * over HTTP would mean reproducing the RSC action protocol, which would be a
 * second implementation of the thing under test. The warm-up user is deleted
 * afterwards so no suite can see it.
 */
async function warmAuthenticated(base: string, executablePath: string | undefined): Promise<void> {
  const browser = await chromium.launch(executablePath ? { executablePath } : undefined)
  const prisma = new PrismaClient()
  try {
    const page = await browser.newPage()
    await page.goto(`${base}/signin`, { waitUntil: 'domcontentloaded' })
    await page.getByLabel('Email address').fill(WARM_EMAIL)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 120_000 })

    // /dashboard bounces back to onboarding without a profile row, so it would
    // never compile. Creating the row directly keeps this to one step.
    const user = await prisma.user.findUnique({ where: { email: WARM_EMAIL } })
    if (user) {
      await prisma.studentProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      })
    }

    for (const route of AUTHENTICATED_ROUTES) {
      await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {})
    }
  } catch {
    // Warming is an optimisation. If it cannot complete, the suites still run —
    // they just pay the compile cost themselves, which is what retries cover.
  } finally {
    await prisma.$disconnect()
    await browser.close()
    await clearUser(WARM_EMAIL)
  }
}

/**
 * Confirms something is actually answering before any suite runs.
 *
 * These suites drive a dev server the developer starts separately. When none is
 * running, every test fails on a missing element — nine confusing failures that
 * read like a broken product rather than a missing server. Worse, a dev server
 * left over from an earlier session keeps port 3000 and serves whatever code it
 * started with, so a run can pass or fail against something other than the
 * working tree. One clear sentence here is worth more than either.
 */
async function requireServer(base: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${base}/signin`, { redirect: 'manual', signal: AbortSignal.timeout(60_000) })
  } catch (cause) {
    throw new Error(
      `No usable server at ${base}.\n` +
        `Start one with \`npm run dev\` and make sure it took port 3000 — if it reports ` +
        `"Port 3000 is in use" and falls back to 3001, an older server still holds the port ` +
        `and these tests would run against its code, not yours.`,
      { cause },
    )
  }
  // Reached the server but it cannot render: a distinct problem, said distinctly.
  if (res.status >= 500) {
    throw new Error(`${base}/signin answered ${res.status}. The server is up but erroring — check its output.`)
  }
}

export default async function globalSetup(config: FullConfig) {
  const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'
  await requireServer(base)

  const warm = async (route: string, init?: RequestInit) => {
    try {
      await fetch(`${base}${route}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(60_000),
        ...init,
      })
    } catch {
      // A route that will not warm is not a reason to refuse to run; the test
      // that needs it will report a far clearer failure than this would.
    }
  }

  for (const route of ROUTES) await warm(route)
  for (const route of GET_ROUTES) await warm(route)
  for (const route of POST_ROUTES) await warm(route, { method: 'POST', body: new FormData() })

  await warmAuthenticated(base, config.projects[0]?.use?.launchOptions?.executablePath)
}
