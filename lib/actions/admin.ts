'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { encodeJson } from '@/lib/db/codec'
import { sweepExpired } from '@/lib/discovery/pipeline'
import { purgeExpiredData } from '@/lib/jobs/retention'

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
