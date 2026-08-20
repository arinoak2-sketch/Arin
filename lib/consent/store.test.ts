import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

/**
 * Parental consent storage.
 *
 * These are the properties that make the consent record worth anything as
 * evidence, and none of them are visible from the UI: that the raw token is
 * never stored, that a settled link cannot be replayed into a different
 * answer, that an expired one is refused, that declining is final, and that a
 * re-request kills the previous link.
 *
 * The e2e suite drives the flow a parent would see. This tests what the flow
 * leaves behind.
 *
 * Uses the development database and cleans up after itself.
 */

const emailCapability = vi.fn(() => ({ available: true }) as { available: boolean; reason?: string })
const resendApiKey = vi.fn<() => string | null>(() => 'test-key')
const consentEmailFrom = vi.fn<() => string | null>(() => 'Lumen <no-reply@example.org>')

vi.mock('@/lib/config', () => ({
  appOrigin: () => 'https://lumen.example',
  emailCapability: () => emailCapability(),
  resendApiKey: () => resendApiKey(),
  consentEmailFrom: () => consentEmailFrom(),
}))

const { requestParentalConsent, lookupConsentToken, settleConsent, consentFor } = await import('./store')
const { prisma } = await import('@/lib/db/client')

const EMAIL = 'consent-store-test@example.com'
const PARENT = 'a-parent@example.com'

let userId = ''
/** The approval links the mocked mailer saw, newest last. */
let sentLinks: string[] = []

const tokenFromLastEmail = (): string => {
  const link = sentLinks.at(-1) ?? ''
  return link.split('/consent/')[1] ?? ''
}

function mockMailer(ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { html: string; text: string }
      const match = /https:\/\/lumen\.example\/consent\/([A-Za-z0-9_-]+)/.exec(body.text)
      if (match?.[1]) sentLinks.push(`https://lumen.example/consent/${match[1]}`)
      return ok
        ? new Response(JSON.stringify({ id: 'x' }), { status: 200 })
        : new Response('sender not verified', { status: 403 })
    }),
  )
}

beforeEach(async () => {
  sentLinks = []
  emailCapability.mockReturnValue({ available: true })
  resendApiKey.mockReturnValue('test-key')
  consentEmailFrom.mockReturnValue('Lumen <no-reply@example.org>')
  mockMailer()

  await prisma.user.deleteMany({ where: { email: EMAIL } })
  const user = await prisma.user.create({ data: { email: EMAIL, name: 'Sam Student' } })
  userId = user.id
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await prisma.user.deleteMany({ where: { email: EMAIL } })
})

describe('requesting consent', () => {
  it('stores only a hash of the token, never the token itself', async () => {
    await requestParentalConsent(userId, PARENT)
    const token = tokenFromLastEmail()
    expect(token.length).toBeGreaterThan(20)

    const row = await prisma.parentalConsent.findUniqueOrThrow({ where: { userId } })
    // A database read must not yield the ability to approve an account.
    expect(row.tokenHash).not.toBe(token)
    expect(row.tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(JSON.stringify(row)).not.toContain(token)
  })

  it('rejects the student’s own address', async () => {
    const outcome = await requestParentalConsent(userId, EMAIL)
    expect(outcome.ok).toBe(false)
    expect(outcome.problem).toMatch(/your own address/i)
    expect(await prisma.parentalConsent.findUnique({ where: { userId } })).toBeNull()
  })

  it('records the request even when the email fails, and says why', async () => {
    mockMailer(false)
    const outcome = await requestParentalConsent(userId, PARENT)

    // The student must not be left waiting on something nobody knows failed.
    expect(outcome.ok).toBe(true)
    expect(outcome.delivered).toBe(false)
    const row = await consentFor(userId)
    expect(row?.status).toBe('PENDING')
    expect(row?.deliveryError).toMatch(/403|sender not verified/i)
  })

  it('records the request when no mail provider is configured at all', async () => {
    resendApiKey.mockReturnValue(null)
    emailCapability.mockReturnValue({ available: false, reason: 'not configured here' })

    const outcome = await requestParentalConsent(userId, PARENT)
    expect(outcome.delivered).toBe(false)
    expect((await consentFor(userId))?.deliveryError).toBe('not configured here')
  })

  it('invalidates the previous link when a new request is made', async () => {
    await requestParentalConsent(userId, PARENT)
    const first = tokenFromLastEmail()

    await requestParentalConsent(userId, 'other-parent@example.com')
    const second = tokenFromLastEmail()
    expect(second).not.toBe(first)

    // A mistyped address must not leave a live approval link in a stranger's inbox.
    expect(await lookupConsentToken(first)).toBeNull()
    expect(await lookupConsentToken(second)).not.toBeNull()
  })

  it('does not let a declined account ask again', async () => {
    await requestParentalConsent(userId, PARENT)
    await settleConsent(tokenFromLastEmail(), 'decline', null)

    const outcome = await requestParentalConsent(userId, PARENT)
    expect(outcome.ok).toBe(false)
    expect(outcome.problem).toMatch(/declined/i)
  })
})

describe('looking a token up', () => {
  it('refuses a token that was never issued', async () => {
    expect(await lookupConsentToken('not-a-real-token')).toBeNull()
  })

  it('refuses empty and absurdly long input without touching the database', async () => {
    expect(await lookupConsentToken('')).toBeNull()
    expect(await lookupConsentToken('x'.repeat(5000))).toBeNull()
  })

  it('reports a live request as pending', async () => {
    await requestParentalConsent(userId, PARENT)
    expect((await lookupConsentToken(tokenFromLastEmail()))?.status).toBe('PENDING')
  })

  it('reports an expired request as expired rather than pending', async () => {
    await requestParentalConsent(userId, PARENT)
    const token = tokenFromLastEmail()
    await prisma.parentalConsent.update({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect((await lookupConsentToken(token))?.status).toBe('EXPIRED')
  })

  it('stops naming the student once the request is settled', async () => {
    // The link lives in an inbox forever and may be forwarded. A parent who has
    // already answered does not need the child named again to understand that,
    // and a leaked old link should not keep identifying a minor.
    await requestParentalConsent(userId, PARENT)
    const token = tokenFromLastEmail()
    await settleConsent(token, 'grant', null)

    const lookup = await lookupConsentToken(token)
    expect(lookup?.status).toBe('GRANTED')
    expect(lookup?.studentName).toBeNull()
    expect(lookup?.studentEmail).toBeNull()
  })

  it('still names the student while a decision is genuinely needed', async () => {
    await requestParentalConsent(userId, PARENT)
    const lookup = await lookupConsentToken(tokenFromLastEmail())
    expect(lookup?.studentName).toBe('Sam Student')
    expect(lookup?.studentEmail).toBe(EMAIL)
  })
})

describe('settling', () => {
  it('grants, and records that it was a deliberate act', async () => {
    await requestParentalConsent(userId, PARENT)
    expect(await settleConsent(tokenFromLastEmail(), 'grant', '203.0.113.9')).toBe('GRANTED')

    const row = await prisma.parentalConsent.findUniqueOrThrow({ where: { userId } })
    expect(row.grantedAt).not.toBeNull()
    // Evidence, not surveillance: the address is hashed, never stored raw.
    expect(row.grantedIpHash).toBeTruthy()
    expect(row.grantedIpHash).not.toContain('203.0.113.9')
  })

  it('does not require an address to be recorded', async () => {
    await requestParentalConsent(userId, PARENT)
    expect(await settleConsent(tokenFromLastEmail(), 'grant', null)).toBe('GRANTED')
    expect((await consentFor(userId))?.status).toBe('GRANTED')
  })

  it('cannot be replayed to flip an answer', async () => {
    await requestParentalConsent(userId, PARENT)
    const token = tokenFromLastEmail()

    expect(await settleConsent(token, 'grant', null)).toBe('GRANTED')
    expect(await settleConsent(token, 'decline', null)).toBe('ALREADY_SETTLED')
    expect((await consentFor(userId))?.status).toBe('GRANTED')
  })

  it('treats declining as final', async () => {
    await requestParentalConsent(userId, PARENT)
    const token = tokenFromLastEmail()

    expect(await settleConsent(token, 'decline', null)).toBe('DECLINED')
    expect(await settleConsent(token, 'grant', null)).toBe('ALREADY_SETTLED')
    expect((await consentFor(userId))?.status).toBe('REVOKED')
  })

  it('refuses an expired token', async () => {
    await requestParentalConsent(userId, PARENT)
    const token = tokenFromLastEmail()
    await prisma.parentalConsent.update({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(await settleConsent(token, 'grant', null)).toBe('EXPIRED')
    expect((await consentFor(userId))?.status).not.toBe('GRANTED')
  })

  it('refuses a token that does not exist', async () => {
    expect(await settleConsent('made-up', 'grant', null)).toBe('NOT_FOUND')
  })

  it('stops holding the parent’s address once it is no longer needed', async () => {
    // The schema promises this. It exists only to deliver one message.
    await requestParentalConsent(userId, PARENT)
    await settleConsent(tokenFromLastEmail(), 'grant', null)

    const row = await prisma.parentalConsent.findUniqueOrThrow({ where: { userId } })
    expect(row.parentEmail).toBe('')
  })

  it('stops holding it after a decline too', async () => {
    await requestParentalConsent(userId, PARENT)
    await settleConsent(tokenFromLastEmail(), 'decline', null)

    const row = await prisma.parentalConsent.findUniqueOrThrow({ where: { userId } })
    expect(row.parentEmail).toBe('')
  })
})
