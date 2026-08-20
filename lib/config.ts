/**
 * Runtime capability detection.
 *
 * Lumen degrades by *saying so*, never by quietly producing worse results. Any
 * feature that depends on a credential asks here first, and the UI renders an
 * explicit unavailable state — with the setup step — when the answer is no.
 *
 * Server-only: nothing in this file may be imported from a client component.
 */

import 'server-only'

const read = (key: string): string | null => {
  const v = process.env[key]
  return v && v.trim().length > 0 ? v.trim() : null
}

export const isProduction = process.env.NODE_ENV === 'production'

export interface Capability {
  available: boolean
  /** Shown to the user verbatim when unavailable. Plain, no blame, no jargon. */
  reason?: string
  /** Where an operator goes to fix it. Never shown to students. */
  setupUrl?: string
  envVar?: string
}

const unavailable = (reason: string, envVar: string, setupUrl: string): Capability => ({
  available: false,
  reason,
  envVar,
  setupUrl,
})

/** Live web discovery. Without it, only the stored corpus is browsable. */
export function searchCapability(): Capability {
  return read('BRAVE_SEARCH_API_KEY')
    ? { available: true }
    : unavailable(
        'Live discovery is not configured yet, so Lumen is showing only opportunities it has already found and stored.',
        'BRAVE_SEARCH_API_KEY',
        'https://brave.com/search/api/',
      )
}

/** AI gap-fill extraction and the advisor. Never required for matching. */
export function aiCapability(): Capability {
  return read('ANTHROPIC_API_KEY')
    ? { available: true }
    : unavailable(
        'The AI advisor is not configured. Matching, checklists, deadlines and reminders all work without it.',
        'ANTHROPIC_API_KEY',
        'https://console.anthropic.com/settings/keys',
      )
}

/**
 * Outbound email. Needed only for the parental-consent request.
 *
 * Without it the consent flow still records the request and the admin queue
 * shows which ones failed to send, but nothing is delivered: the approval
 * token is hashed at rest and cannot be recovered, deliberately, so there is
 * no way for an operator to pass a link on by hand — and therefore no way for
 * one to approve an account on a parent's behalf. The account simply stays
 * locked until email works and a parent answers.
 */
export function emailCapability(): Capability {
  return read('RESEND_API_KEY') && read('CONSENT_EMAIL_FROM')
    ? { available: true }
    : unavailable(
        'Consent emails cannot be sent on this deployment, so accounts needing parental permission stay locked until it is configured.',
        'RESEND_API_KEY / CONSENT_EMAIL_FROM',
        'https://resend.com/api-keys',
      )
}

/**
 * The origin used to build links that arrive in someone's inbox.
 *
 * Never derived from the incoming request: a request header is attacker-
 * controlled, and a consent approval link built from one could be pointed at
 * another host. Configuration only, and localhost in development.
 */
export function appOrigin(): string {
  const configured = read('APP_ORIGIN')
  if (configured) return configured.replace(/\/+$/, '')
  if (isProduction) throw new Error('APP_ORIGIN must be set in production — consent links depend on it.')
  return 'http://localhost:3000'
}

export const resendApiKey = () => read('RESEND_API_KEY')
export const consentEmailFrom = () => read('CONSENT_EMAIL_FROM')

export function googleAuthCapability(): Capability {
  return read('AUTH_GOOGLE_ID') && read('AUTH_GOOGLE_SECRET')
    ? { available: true }
    : unavailable(
        'Google sign-in is not configured on this deployment.',
        'AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET',
        'https://console.cloud.google.com/apis/credentials',
      )
}

/**
 * Dev-only sign-in exists so the app is testable before Google credentials
 * are created. Allowing it in production would be an unauthenticated door,
 * so production refuses it regardless of what the variable says.
 */
export function devSignInAllowed(): boolean {
  return !isProduction && read('ALLOW_DEV_SIGNIN') === 'true'
}

export const braveApiKey = () => read('BRAVE_SEARCH_API_KEY')
export const anthropicApiKey = () => read('ANTHROPIC_API_KEY')
export const anthropicModel = () => read('ANTHROPIC_MODEL') ?? 'claude-opus-5'

export function braveMonthlyBudget(): number {
  const raw = read('BRAVE_MONTHLY_QUERY_BUDGET')
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN
  // Conservative default: the free tier is ~2,000/month and overrunning it
  // fails requests mid-session, which is worse than pausing deliberately.
  return Number.isFinite(n) && n > 0 ? n : 1800
}

/** Fails fast at boot rather than shipping an insecure production deployment. */
export function assertProductionSafety(): void {
  if (!isProduction) return
  const problems: string[] = []
  if (!read('AUTH_SECRET')) problems.push('AUTH_SECRET is not set.')
  if (process.env.ALLOW_DEV_SIGNIN === 'true') {
    problems.push('ALLOW_DEV_SIGNIN must not be "true" in production — it bypasses Google sign-in.')
  }
  if (!googleAuthCapability().available) {
    problems.push('Google sign-in is not configured, and dev sign-in is unavailable in production.')
  }
  if (problems.length > 0) {
    throw new Error(`Refusing to start in production:\n  - ${problems.join('\n  - ')}`)
  }
}
