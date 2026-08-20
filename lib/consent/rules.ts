/**
 * Who needs parental consent, and for how long a request stays valid.
 *
 * Pure and unit-tested. Nothing here touches the database or the network, so
 * the age rule can be reasoned about and tested on its own — it is the part
 * with legal consequences, and it should not be tangled up with I/O.
 */

/** Below this, Lumen is not for you anywhere in the world. */
export const MINIMUM_AGE = 13

/**
 * The EU digital-consent age Lumen enforces.
 *
 * GDPR Art. 8 lets each member state set this anywhere from 13 to 16, and they
 * differ. Lumen applies the highest, uniformly. That over-blocks 13-15s in
 * countries which permit 13 — a real cost, and a deliberate one: every error
 * lands in the safe direction, and the source asserts no legal claim about any
 * individual country. Lowering it for a specific market is a decision for
 * whoever has advice for that market, not a default.
 */
export const EU_CONSENT_AGE = 16

/** EU/EEA member states. Residency here triggers the Art. 8 check. */
export const EU_COUNTRIES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE', 'IS', 'LI', 'NO',
])

/** An approval link is a credential. It should not outlive its usefulness. */
export const CONSENT_REQUEST_TTL_DAYS = 14

export type AgeVerdict =
  /** Old enough, nothing further required. */
  | { kind: 'ALLOWED' }
  /** Under 13 everywhere: no consent mechanism opens this door. */
  | { kind: 'TOO_YOUNG' }
  /** EU resident below the consent age: usable once a parent approves. */
  | { kind: 'NEEDS_PARENTAL_CONSENT'; age: number }

/**
 * Whole years elapsed, in UTC.
 *
 * A birthday is a calendar event, not a duration: dividing elapsed
 * milliseconds by 365.25 gets someone's age wrong for a day around their
 * birthday, and that day decides whether a consent flow is legally required.
 */
export function ageOn(dateOfBirth: Date, now: Date): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear()
  const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) age--
  return age
}

/**
 * Decides what an account may do, from date of birth and country alone.
 *
 * An unknown country cannot trigger the EU rule — Lumen does not guess where
 * someone lives in order to decide whether to restrict them, and it has no
 * other signal it is willing to use for that.
 */
export function assessAge(
  dateOfBirth: Date | null,
  countryCode: string | null,
  now: Date = new Date(),
): AgeVerdict {
  if (!dateOfBirth) return { kind: 'ALLOWED' }

  const age = ageOn(dateOfBirth, now)
  if (age < MINIMUM_AGE) return { kind: 'TOO_YOUNG' }

  const country = countryCode?.toUpperCase() ?? null
  if (country && EU_COUNTRIES.has(country) && age < EU_CONSENT_AGE) {
    return { kind: 'NEEDS_PARENTAL_CONSENT', age }
  }
  return { kind: 'ALLOWED' }
}

export const consentExpiryFrom = (requestedAt: Date): Date =>
  new Date(requestedAt.getTime() + CONSENT_REQUEST_TTL_DAYS * 86_400_000)

export interface ConsentRecord {
  grantedAt: Date | null
  revokedAt: Date | null
  expiresAt: Date
}

export type ConsentStatus = 'GRANTED' | 'PENDING' | 'EXPIRED' | 'REVOKED' | 'NONE'

export function consentStatus(record: ConsentRecord | null, now: Date = new Date()): ConsentStatus {
  if (!record) return 'NONE'
  // Revocation outranks everything: a parent withdrawing consent must take
  // effect even on an account that was already approved.
  if (record.revokedAt) return 'REVOKED'
  if (record.grantedAt) return 'GRANTED'
  return record.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'PENDING'
}

/** True when the account may be used normally. */
export function accountUsable(verdict: AgeVerdict, status: ConsentStatus): boolean {
  if (verdict.kind === 'ALLOWED') return true
  if (verdict.kind === 'TOO_YOUNG') return false
  return status === 'GRANTED'
}

/**
 * A parent's address must not be the student's own.
 *
 * Not a security control — a determined student defeats it in seconds with a
 * second mailbox — but it stops the commonest accidental case, where the
 * student types their own address without thinking about whose consent this is.
 */
export function parentEmailProblem(parentEmail: string, studentEmail: string | null): string | null {
  const value = parentEmail.trim().toLowerCase()
  if (value.length === 0) return 'Enter an email address for your parent or guardian.'
  if (value.length > 254) return 'That email address is too long.'
  // Deliberately permissive: the only reliable test of an address is delivery.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return 'That does not look like an email address.'
  if (studentEmail && value === studentEmail.trim().toLowerCase()) {
    return 'That is your own address. Consent has to come from your parent or guardian.'
  }
  return null
}
