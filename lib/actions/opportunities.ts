'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { SAVED_STATES, APPLICATION_STATUSES } from '@/lib/db/enums'
import { startApplicationFor } from '@/lib/applications/start'

/**
 * Student write actions.
 *
 * Every one resolves the user from the session and scopes its query by that id.
 * No action accepts a user id from the caller — that is the whole authorisation
 * model, and it is why none of these can be made to touch another student's row.
 */

const idSchema = z.string().min(1).max(64)

export async function setSavedState(opportunityId: string, state: string) {
  const user = await requireUser()
  const parsedId = idSchema.parse(opportunityId)
  const parsedState = z.enum(SAVED_STATES).parse(state)

  await prisma.savedOpportunity.upsert({
    where: { userId_opportunityId: { userId: user.id, opportunityId: parsedId } },
    create: { userId: user.id, opportunityId: parsedId, state: parsedState },
    update: { state: parsedState },
  })

  revalidatePath('/discover')
  revalidatePath('/dashboard')
  return { ok: true as const, state: parsedState }
}

/**
 * Form-post variant of save/unsave.
 *
 * Rendered as a real <form action={...}>, so it works before React has
 * hydrated. A student tapping Save on a slow connection gets the save, not a
 * dead button — the optimistic UI is an enhancement on top, never the mechanism.
 */
export async function toggleSavedForm(formData: FormData) {
  const user = await requireUser()
  const opportunityId = idSchema.parse(String(formData.get('opportunityId') ?? ''))
  const desired = String(formData.get('desired') ?? 'SAVE')

  if (desired === 'REMOVE') {
    await prisma.savedOpportunity.deleteMany({ where: { userId: user.id, opportunityId } })
  } else {
    await prisma.savedOpportunity.upsert({
      where: { userId_opportunityId: { userId: user.id, opportunityId } },
      create: { userId: user.id, opportunityId, state: 'SAVED' },
      update: { state: 'SAVED' },
    })
  }

  revalidatePath('/discover')
  revalidatePath('/dashboard')
  revalidatePath('/compare')
}

export async function unsave(opportunityId: string) {
  const user = await requireUser()
  await prisma.savedOpportunity.deleteMany({
    where: { userId: user.id, opportunityId: idSchema.parse(opportunityId) },
  })
  revalidatePath('/discover')
  revalidatePath('/dashboard')
  return { ok: true as const }
}

/**
 * Starting an application, for callers that already have a session and do not
 * need to navigate. The route handler at /api/applications/start is the path
 * the UI uses, because that one has to survive a native form post.
 */
export async function startApplication(opportunityId: string) {
  const user = await requireUser()
  const result = await startApplicationFor(user.id, idSchema.parse(opportunityId))

  revalidatePath('/applications')
  revalidatePath('/dashboard')
  return result
}

/**
 * Form-post variant of the checklist toggle, for the same pre-hydration reason
 * as saving. Ticking a step is the single most repeated action in the product.
 */
export async function toggleTaskForm(formData: FormData) {
  const user = await requireUser()
  const taskId = idSchema.parse(String(formData.get('taskId') ?? ''))
  const complete = String(formData.get('complete') ?? 'true') === 'true'

  await prisma.applicationTask.updateMany({
    where: { id: taskId, application: { userId: user.id } },
    data: { isComplete: complete, completedAt: complete ? new Date() : null },
  })

  revalidatePath('/applications')
  revalidatePath('/dashboard')
}

export async function toggleTask(taskId: string, complete: boolean) {
  const user = await requireUser()
  // The join through application.userId is what stops one student toggling
  // another's checklist item by guessing an id.
  const result = await prisma.applicationTask.updateMany({
    where: { id: idSchema.parse(taskId), application: { userId: user.id } },
    data: { isComplete: complete, completedAt: complete ? new Date() : null },
  })
  if (result.count === 0) return { ok: false as const, error: 'That task could not be found.' }

  revalidatePath('/applications')
  revalidatePath('/dashboard')
  return { ok: true as const }
}

/** Form-post variant of the status change, for the pre-hydration reason. */
export async function setApplicationStatusForm(formData: FormData) {
  const user = await requireUser()
  const applicationId = idSchema.parse(String(formData.get('applicationId') ?? ''))
  const status = z.enum(APPLICATION_STATUSES).parse(String(formData.get('status') ?? ''))

  await prisma.application.updateMany({
    where: { id: applicationId, userId: user.id },
    data: {
      status,
      submittedAt: status === 'SUBMITTED' ? new Date() : undefined,
      decisionAt: ['ACCEPTED', 'WAITLISTED', 'REJECTED'].includes(status) ? new Date() : undefined,
      outcome: ['ACCEPTED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN', 'COMPLETED'].includes(status) ? status : undefined,
    },
  })

  revalidatePath('/applications')
  revalidatePath('/dashboard')
}

export async function setApplicationStatus(applicationId: string, status: string) {
  const user = await requireUser()
  const parsedStatus = z.enum(APPLICATION_STATUSES).parse(status)

  const result = await prisma.application.updateMany({
    where: { id: idSchema.parse(applicationId), userId: user.id },
    data: {
      status: parsedStatus,
      submittedAt: parsedStatus === 'SUBMITTED' ? new Date() : undefined,
      decisionAt: ['ACCEPTED', 'WAITLISTED', 'REJECTED'].includes(parsedStatus) ? new Date() : undefined,
      outcome: ['ACCEPTED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN', 'COMPLETED'].includes(parsedStatus)
        ? parsedStatus
        : undefined,
    },
  })
  if (result.count === 0) return { ok: false as const, error: 'That application could not be found.' }

  revalidatePath('/applications')
  revalidatePath('/dashboard')
  return { ok: true as const }
}

/**
 * A student report immediately drops the listing to NEEDS_REVIEW and queues it.
 * One student's report protects the next student, so this takes effect before
 * any human looks at it.
 */
/** A report takes effect immediately, so the ability to file them is capped. */
const MAX_REPORTS_PER_DAY = 20
const DUPLICATE_REPORT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export async function reportOpportunity(opportunityId: string, reason: string, detail?: string) {
  const user = await requireUser()
  const parsedId = idSchema.parse(opportunityId)
  const parsedReason = z
    .enum(['WRONG_DEADLINE', 'EXPIRED', 'NOT_REAL', 'WRONG_ELIGIBILITY', 'BROKEN_LINK', 'OTHER'])
    .parse(reason)

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: parsedId },
    select: { verificationState: true },
  })
  if (!opportunity) return { ok: false as const, error: 'That opportunity no longer exists.' }

  // Reporting drops a listing to "needs review" before any human sees it, which
  // is right for the student who found the problem and wrong as an unlimited
  // power. Without a cap, one account could flag the whole corpus.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentReports = await prisma.verificationEvent.count({
    where: { actorUserId: user.id, action: 'REPORTED', createdAt: { gte: since } },
  })
  if (recentReports >= MAX_REPORTS_PER_DAY) {
    return {
      ok: false as const,
      error: 'You have reported a lot of listings today. Please try again tomorrow.',
    }
  }

  // Re-reporting the same listing is treated as already done rather than
  // re-flagging it, so a double tap does not churn the review queue.
  const alreadyReported = await prisma.verificationEvent.findFirst({
    where: {
      opportunityId: parsedId,
      actorUserId: user.id,
      action: 'REPORTED',
      createdAt: { gte: new Date(Date.now() - DUPLICATE_REPORT_WINDOW_MS) },
    },
    select: { id: true },
  })
  if (alreadyReported) return { ok: true as const }

  await prisma.$transaction([
    prisma.opportunity.update({
      where: { id: parsedId },
      data: {
        verificationState: opportunity.verificationState === 'ARCHIVED' ? 'ARCHIVED' : 'NEEDS_REVIEW',
      },
    }),
    prisma.verificationEvent.create({
      data: {
        opportunityId: parsedId,
        actor: 'USER',
        actorUserId: user.id,
        action: 'REPORTED',
        fieldsTouched: JSON.stringify([parsedReason]),
        note: detail?.slice(0, 500) ?? null,
      },
    }),
  ])

  revalidatePath(`/opportunity`)
  return { ok: true as const }
}

export interface ReportResult {
  ok: boolean
  error?: string
}

/** Form-post variant of reporting, shaped for useActionState. */
export async function reportOpportunityForm(
  _previous: ReportResult | null,
  formData: FormData,
): Promise<ReportResult> {
  const opportunityId = String(formData.get('opportunityId') ?? '')
  const reason = String(formData.get('reason') ?? 'OTHER')
  const detail = String(formData.get('detail') ?? '')
  const result = await reportOpportunity(opportunityId, reason, detail)
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}
