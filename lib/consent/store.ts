import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/db/client'
import { appOrigin, consentEmailFrom, emailCapability, resendApiKey } from '@/lib/config'
import { consentExpiryFrom, consentStatus, parentEmailProblem, type ConsentStatus } from './rules'
import { consentRequestEmail, ResendMailer, type Mailer } from './mail'

/**
 * Storing and settling parental consent.
 *
 * The approval token is generated here, hashed, and only the hash is stored.
 * A read of the database therefore does not yield the ability to approve an
 * account — the same reasoning as never storing a password. The token exists
 * in exactly two places: the parent's inbox, and the URL they click.
 */

const TOKEN_BYTES = 32

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

/** Hashed, not stored raw: an IP is personal data and only needed as evidence. */
const hashIp = (ip: string | null): string | null =>
  ip ? createHash('sha256').update(ip).digest('hex').slice(0, 32) : null

function mailer(): Mailer | null {
  const key = resendApiKey()
  const from = consentEmailFrom()
  return key && from ? new ResendMailer(key, from) : null
}

export interface ConsentRequestOutcome {
  ok: boolean
  /** Plain-language problem with what was submitted. */
  problem?: string
  /** True when the message actually went out. */
  delivered?: boolean
}

/**
 * Records a consent request and tries to send it.
 *
 * Re-requesting replaces any outstanding request for the same account, which
 * invalidates the previous link. That matters: a student who mistypes a parent's
 * address must be able to correct it without leaving a live approval link
 * sitting in a stranger's inbox.
 */
export async function requestParentalConsent(
  userId: string,
  parentEmailRaw: string,
  now: Date = new Date(),
): Promise<ConsentRequestOutcome> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  })
  if (!user) return { ok: false, problem: 'That account could not be found.' }

  const parentEmail = parentEmailRaw.trim().toLowerCase()
  const problem = parentEmailProblem(parentEmail, user.email)
  if (problem) return { ok: false, problem }

  const existing = await prisma.parentalConsent.findUnique({
    where: { userId },
    select: { grantedAt: true, revokedAt: true },
  })
  if (existing?.grantedAt && !existing.revokedAt) return { ok: true, delivered: true }
  if (existing?.revokedAt) {
    // A parent who said no is not asked again by the child on demand.
    return {
      ok: false,
      problem: 'Permission was declined for this account. Contact support if that was a mistake.',
    }
  }

  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const expiresAt = consentExpiryFrom(now)

  await prisma.parentalConsent.upsert({
    where: { userId },
    create: { userId, parentEmail, tokenHash: hashToken(token), requestedAt: now, expiresAt },
    update: {
      parentEmail,
      tokenHash: hashToken(token),
      requestedAt: now,
      expiresAt,
      deliveryAttempted: false,
      deliveryError: null,
    },
  })

  const approvalUrl = `${appOrigin()}/consent/${token}`
  const send = mailer()
  if (!send) {
    await prisma.parentalConsent.update({
      where: { userId },
      data: { deliveryAttempted: false, deliveryError: emailCapability().reason ?? 'No mail provider configured.' },
    })
    return { ok: true, delivered: false }
  }

  try {
    await send.send(
      consentRequestEmail({
        parentEmail,
        studentName: user.name,
        studentEmail: user.email,
        approvalUrl,
        expiresAt,
      }),
    )
    await prisma.parentalConsent.update({
      where: { userId },
      data: { deliveryAttempted: true, deliveryError: null },
    })
    return { ok: true, delivered: true }
  } catch (error) {
    // The request stands even when the message did not go: the admin queue
    // shows it as undelivered rather than the student silently waiting forever.
    await prisma.parentalConsent.update({
      where: { userId },
      data: {
        deliveryAttempted: true,
        deliveryError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown delivery failure.',
      },
    })
    return { ok: true, delivered: false }
  }
}

export interface TokenLookup {
  status: ConsentStatus
  /**
   * Null once the request is settled or expired.
   *
   * The link lives in an inbox indefinitely and may be forwarded on. A parent
   * who has already answered does not need the child named again to understand
   * that, so continuing to identify a minor to anyone holding an old link buys
   * nothing and costs exactly the thing this flow exists to protect.
   */
  studentName: string | null
  studentEmail: string | null
}

/**
 * Resolves an approval token.
 *
 * Compared by hash, and the comparison is constant-time. The lookup is by hash
 * so the database does the work, but the final equality check is explicit so
 * that a future change to a scanning lookup cannot quietly reintroduce a timing
 * signal on token contents.
 */
export async function lookupConsentToken(token: string, now: Date = new Date()): Promise<TokenLookup | null> {
  if (!token || token.length > 200) return null
  const tokenHash = hashToken(token)

  const record = await prisma.parentalConsent.findUnique({
    where: { tokenHash },
    select: {
      tokenHash: true,
      grantedAt: true,
      revokedAt: true,
      expiresAt: true,
      user: { select: { name: true, email: true } },
    },
  })
  if (!record) return null

  const a = Buffer.from(record.tokenHash)
  const b = Buffer.from(tokenHash)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const status = consentStatus(record, now)
  const answerStillNeeded = status === 'PENDING'

  return {
    status,
    studentName: answerStillNeeded ? record.user.name : null,
    studentEmail: answerStillNeeded ? record.user.email : null,
  }
}

export type SettleOutcome = 'GRANTED' | 'DECLINED' | 'ALREADY_SETTLED' | 'EXPIRED' | 'NOT_FOUND'

/**
 * Records the parent's answer.
 *
 * Declining is a first-class outcome, not silence — it revokes immediately and
 * the token is spent either way, so a link cannot be replayed to flip an answer.
 */
export async function settleConsent(
  token: string,
  decision: 'grant' | 'decline',
  ip: string | null,
  now: Date = new Date(),
): Promise<SettleOutcome> {
  const tokenHash = hashToken(token)
  const record = await prisma.parentalConsent.findUnique({ where: { tokenHash } })
  if (!record) return 'NOT_FOUND'

  const status = consentStatus(record, now)
  if (status === 'GRANTED' || status === 'REVOKED') return 'ALREADY_SETTLED'
  if (status === 'EXPIRED') return 'EXPIRED'

  if (decision === 'decline') {
    await prisma.parentalConsent.update({
      where: { tokenHash },
      data: { revokedAt: now, parentEmail: '' },
    })
    return 'DECLINED'
  }

  // The address is cleared on grant as well as on decline. It existed to
  // deliver exactly one message; what evidences the consent afterwards is
  // grantedAt and grantedIpHash, not a parent's contact details kept on file.
  await prisma.parentalConsent.update({
    where: { tokenHash },
    data: { grantedAt: now, grantedIpHash: hashIp(ip), parentEmail: '' },
  })
  return 'GRANTED'
}

/** The consent state for an account, or null when none was ever requested. */
export async function consentFor(userId: string, now: Date = new Date()) {
  const record = await prisma.parentalConsent.findUnique({
    where: { userId },
    select: { parentEmail: true, requestedAt: true, expiresAt: true, grantedAt: true, revokedAt: true, deliveryAttempted: true, deliveryError: true },
  })
  return record ? { ...record, status: consentStatus(record, now) } : null
}
