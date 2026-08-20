'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { encodeJson } from '@/lib/db/codec'
import { ingestUrl, sweepExpired } from '@/lib/discovery/pipeline'
import { purgeExpiredData } from '@/lib/jobs/retention'
import { requestParentalConsent } from '@/lib/consent/store'

/**
 * Admin actions.
 *
 * Verification is append-only: approving writes an event and the displayed
 * "last verified" date is read back from that history. There is no way to set
 * the date directly, which is what stops it from ever being decorative.
 */

const idSchema = z.string().min(1).max(64)

export async function approveOpportunity(opportunityId: string, note?: string) {
  const admin = await requireAdmin()
  const id = idSchema.parse(opportunityId)
  const now = new Date()

  await prisma.$transaction([
    prisma.opportunity.update({
      where: { id },
      data: { verificationState: 'VERIFIED', lastVerifiedAt: now },
    }),
    prisma.verificationEvent.create({
      data: {
        opportunityId: id,
        actor: 'ADMIN',
        actorUserId: admin.id,
        action: 'APPROVED',
        fieldsTouched: encodeJson(['verificationState']),
        note: note?.slice(0, 500) ?? 'Key fields confirmed against the official page.',
      },
    }),
  ])

  revalidatePath('/admin')
  return { ok: true as const }
}

export async function archiveOpportunity(opportunityId: string, note?: string) {
  const admin = await requireAdmin()
  const id = idSchema.parse(opportunityId)

  await prisma.$transaction([
    prisma.opportunity.update({ where: { id }, data: { verificationState: 'ARCHIVED' } }),
    prisma.verificationEvent.create({
      data: {
        opportunityId: id,
        actor: 'ADMIN',
        actorUserId: admin.id,
        action: 'REJECTED',
        fieldsTouched: encodeJson(['verificationState']),
        note: note?.slice(0, 500) ?? 'Archived by a reviewer.',
      },
    }),
  ])

  revalidatePath('/admin')
  return { ok: true as const }
}

export async function runExpirySweep() {
  await requireAdmin()
  const count = await sweepExpired()
  revalidatePath('/admin')
  return { ok: true as const, count }
}

/**
 * Runs the retention purge on demand. The scheduled job is the primary route;
 * this exists so an operator can prove the policy is being kept without
 * waiting a day for the next firing.
 */
export async function runRetentionPurge() {
  await requireAdmin()
  const report = await purgeExpiredData()
  revalidatePath('/admin')
  return {
    ok: true as const,
    discoveryQueriesPurged: report.discoveryQueriesPurged,
    notificationsPurged: report.notificationsPurged,
  }
}

export interface AddByUrlState {
  status: 'idle' | 'created' | 'review' | 'merged' | 'rejected'
  message?: string
  slug?: string
  title?: string
}

/**
 * Adds one opportunity from a URL an admin supplies.
 *
 * Rate-limited per admin, because this triggers an outbound fetch on an
 * address the server did not choose. The fetcher's SSRF guard is what makes
 * that safe; the limit is what stops the endpoint being useful as a way to
 * make a lot of requests through someone else's server.
 */
const ADDS_PER_HOUR = 30

export async function addOpportunityByUrl(
  _prev: AddByUrlState,
  form: FormData,
): Promise<AddByUrlState> {
  const admin = await requireAdmin()

  const since = new Date(Date.now() - 60 * 60 * 1000)
  const recent = await prisma.verificationEvent.count({
    where: { actorUserId: admin.id, action: 'DISCOVERED', createdAt: { gte: since } },
  })
  if (recent >= ADDS_PER_HOUR) {
    return {
      status: 'rejected',
      message: `That is ${ADDS_PER_HOUR} pages in an hour, which is the limit. Try again shortly.`,
    }
  }

  const result = await ingestUrl(String(form.get('url') ?? ''), { actorUserId: admin.id })
  revalidatePath('/admin')

  switch (result.status) {
    case 'created':
      return {
        status: 'created',
        slug: result.slug,
        title: result.title,
        message: 'Read and stored. Check the fields against the page before verifying it.',
      }
    case 'review':
      return {
        status: 'review',
        slug: result.slug,
        title: result.title,
        message:
          'Stored and queued for review — something about it could not be established from the page alone.',
      }
    case 'merged':
      return {
        status: 'merged',
        slug: result.slug,
        title: result.title,
        message: 'Already in the corpus. Recorded as another source for the existing listing.',
      }
    default:
      return { status: 'rejected', message: result.reason ?? 'That page could not be read.' }
  }
}

export interface ConsentRetryState {
  message?: string
}

/**
 * Retries a consent email that failed to send.
 *
 * The only action an admin has over a consent request. There is no "approve on
 * their behalf" and no way to read the approval link: the token is stored as a
 * hash, so it cannot be recovered by anyone, including whoever runs the server.
 * That is what keeps a granted consent meaningful.
 */
export async function retryConsentDelivery(
  _prev: ConsentRetryState,
  form: FormData,
): Promise<ConsentRetryState> {
  await requireAdmin()
  const userId = idSchema.parse(String(form.get('userId') ?? ''))

  const existing = await prisma.parentalConsent.findUnique({
    where: { userId },
    select: { parentEmail: true },
  })
  if (!existing?.parentEmail) return { message: 'That request no longer exists.' }

  // Re-requesting issues a fresh token, which invalidates the old one. That is
  // correct here: the previous link never reached anybody.
  const outcome = await requestParentalConsent(userId, existing.parentEmail)
  revalidatePath('/admin')

  if (!outcome.ok) return { message: outcome.problem ?? 'Could not send.' }
  return {
    message: outcome.delivered
      ? 'Sent. The parent has a fresh link; any earlier one no longer works.'
      : 'Still could not send — check the mail configuration and the error shown above.',
  }
}
