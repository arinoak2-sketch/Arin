import { describe, expect, it } from 'vitest'
import {
  accountUsable,
  ageOn,
  assessAge,
  consentExpiryFrom,
  consentStatus,
  parentEmailProblem,
} from './rules'

const NOW = new Date('2026-06-15T12:00:00Z')
const dob = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('ageOn', () => {
  it('counts whole years', () => {
    expect(ageOn(dob('2010-06-15'), NOW)).toBe(16)
    expect(ageOn(dob('2010-06-16'), NOW)).toBe(15)
  })

  it('is right on the birthday itself, which is the day the rule changes', () => {
    // The day before a sixteenth birthday still requires consent; the day of
    // it does not. Elapsed-milliseconds arithmetic gets this wrong.
    expect(ageOn(dob('2010-06-14'), NOW)).toBe(16)
    expect(ageOn(dob('2010-06-15'), NOW)).toBe(16)
    expect(ageOn(dob('2010-06-16'), NOW)).toBe(15)
  })

  it('handles a 29 February birthday', () => {
    expect(ageOn(dob('2008-02-29'), new Date('2026-02-28T12:00:00Z'))).toBe(17)
    expect(ageOn(dob('2008-02-29'), new Date('2026-03-01T12:00:00Z'))).toBe(18)
  })
})

describe('assessAge', () => {
  it('allows an adult anywhere', () => {
    expect(assessAge(dob('2000-01-01'), 'DE', NOW).kind).toBe('ALLOWED')
  })

  it('allows a 14-year-old outside the EU', () => {
    expect(assessAge(dob('2012-01-01'), 'IN', NOW).kind).toBe('ALLOWED')
    expect(assessAge(dob('2012-01-01'), 'GB', NOW).kind).toBe('ALLOWED')
  })

  it('requires consent for a 14-year-old in the EU', () => {
    const v = assessAge(dob('2012-01-01'), 'DE', NOW)
    expect(v.kind).toBe('NEEDS_PARENTAL_CONSENT')
  })

  it('applies the same rule across the EEA, not just the EU', () => {
    for (const country of ['NO', 'IS', 'LI']) {
      expect(assessAge(dob('2012-01-01'), country, NOW).kind, country).toBe('NEEDS_PARENTAL_CONSENT')
    }
  })

  it('applies a uniform 16 even where a member state sets 13', () => {
    // Denmark and Sweden set 13. Lumen still asks, deliberately: over-blocking
    // is the safe direction, and the source makes no per-country legal claim.
    for (const country of ['DK', 'SE']) {
      expect(assessAge(dob('2012-01-01'), country, NOW).kind, country).toBe('NEEDS_PARENTAL_CONSENT')
    }
  })

  it('stops turning 16 in the EU into a consent requirement', () => {
    expect(assessAge(dob('2010-06-15'), 'FR', NOW).kind).toBe('ALLOWED')
  })

  it('refuses under-13s regardless of country', () => {
    for (const country of ['US', 'DE', 'IN', null]) {
      expect(assessAge(dob('2014-01-01'), country, NOW).kind, String(country)).toBe('TOO_YOUNG')
    }
  })

  it('does not guess a country in order to restrict someone', () => {
    // No country stated: the EU rule cannot fire on an assumption.
    expect(assessAge(dob('2012-01-01'), null, NOW).kind).toBe('ALLOWED')
  })

  it('is case-insensitive about the country code', () => {
    expect(assessAge(dob('2012-01-01'), 'de', NOW).kind).toBe('NEEDS_PARENTAL_CONSENT')
  })

  it('allows an unstated date of birth through, since onboarding is skippable', () => {
    expect(assessAge(null, 'DE', NOW).kind).toBe('ALLOWED')
  })
})

describe('consentStatus', () => {
  const future = new Date('2026-06-29T12:00:00Z')
  const past = new Date('2026-06-01T12:00:00Z')

  it('reports NONE when nothing was ever requested', () => {
    expect(consentStatus(null, NOW)).toBe('NONE')
  })

  it('is pending while the link is still live', () => {
    expect(consentStatus({ grantedAt: null, revokedAt: null, expiresAt: future }, NOW)).toBe('PENDING')
  })

  it('expires an unanswered request', () => {
    expect(consentStatus({ grantedAt: null, revokedAt: null, expiresAt: past }, NOW)).toBe('EXPIRED')
  })

  it('reports a granted consent', () => {
    expect(consentStatus({ grantedAt: past, revokedAt: null, expiresAt: past }, NOW)).toBe('GRANTED')
  })

  it('lets revocation override an existing grant', () => {
    // A parent withdrawing consent must take effect on an approved account.
    expect(consentStatus({ grantedAt: past, revokedAt: NOW, expiresAt: future }, NOW)).toBe('REVOKED')
  })
})

describe('accountUsable', () => {
  it('lets an unaffected account through whatever the consent state', () => {
    expect(accountUsable({ kind: 'ALLOWED' }, 'NONE')).toBe(true)
  })

  it('never lets an under-13 account through', () => {
    for (const status of ['GRANTED', 'PENDING', 'NONE'] as const) {
      expect(accountUsable({ kind: 'TOO_YOUNG' }, status), status).toBe(false)
    }
  })

  it('opens an EU under-16 account only once consent is granted', () => {
    const verdict = { kind: 'NEEDS_PARENTAL_CONSENT', age: 14 } as const
    expect(accountUsable(verdict, 'GRANTED')).toBe(true)
    for (const status of ['PENDING', 'EXPIRED', 'REVOKED', 'NONE'] as const) {
      expect(accountUsable(verdict, status), status).toBe(false)
    }
  })
})

describe('parentEmailProblem', () => {
  it('accepts an ordinary address', () => {
    expect(parentEmailProblem('parent@example.com', 'student@example.com')).toBeNull()
  })

  it('rejects the student’s own address, however it is cased or spaced', () => {
    expect(parentEmailProblem('  Student@Example.com ', 'student@example.com')).toMatch(/your own address/i)
  })

  it('asks for something when the field is empty', () => {
    expect(parentEmailProblem('   ', 'student@example.com')).toMatch(/enter an email/i)
  })

  it('rejects text that is not an address', () => {
    for (const value of ['mum', 'mum@', '@example.com', 'mum@example']) {
      expect(parentEmailProblem(value, null), value).toMatch(/email address/i)
    }
  })
})

describe('consentExpiryFrom', () => {
  it('gives the request a bounded life', () => {
    const expiry = consentExpiryFrom(NOW)
    expect(expiry.getTime()).toBeGreaterThan(NOW.getTime())
    expect(Math.round((expiry.getTime() - NOW.getTime()) / 86_400_000)).toBe(14)
  })
})
