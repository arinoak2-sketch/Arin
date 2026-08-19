/**
 * Runs once at server startup.
 *
 * assertProductionSafety() existed but was never called, which made it
 * decorative: a production deploy with ALLOW_DEV_SIGNIN=true or no AUTH_SECRET
 * would have booted happily with an authentication bypass. Failing to start is
 * the correct behaviour — a student platform should not run half-secured.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { assertProductionSafety } = await import('./lib/config')
  assertProductionSafety()
}
