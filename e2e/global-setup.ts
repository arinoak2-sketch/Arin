/**
 * Warms every route before the suites run.
 *
 * The dev server compiles routes on first request, which can take tens of
 * seconds for the heavier pages. Without this the first test to touch a cold
 * route fails on a timeout that looks exactly like a real bug — and did,
 * repeatedly, until this moved out of my shell history and into the config.
 */
/** Pages. */
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

export default async function globalSetup() {
  const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'

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
}
