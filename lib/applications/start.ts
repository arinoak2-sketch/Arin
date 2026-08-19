import 'server-only'
import { prisma } from '@/lib/db/client'
import { decodeRequirements } from '@/lib/db/codec'
import { buildChecklist } from '@/lib/intelligence/checklist'

/**
 * Creates an application and its checklist.
 *
 * Shared by the route handler and the server action so there is one definition
 * of what "starting an application" means. The checklist is generated from the
 * opportunity's stated requirements, ordered longest-lead-time first, so the
 * recommendation letter is the first thing the student meets.
 */
export async function startApplicationFor(userId: string, opportunityId: string) {
  if (!opportunityId) return { ok: false as const, error: 'No opportunity given.' }

  const existing = await prisma.application.findUnique({
    where: { userId_opportunityId: { userId, opportunityId } },
    select: { id: true },
  })
  if (existing) return { ok: true as const, applicationId: existing.id, alreadyExisted: true }

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { requirements: true },
  })
  if (!opportunity) return { ok: false as const, error: 'That opportunity no longer exists.' }

  const tasks = buildChecklist(decodeRequirements(opportunity.requirements))

  const application = await prisma.application.create({
    data: {
      userId,
      opportunityId,
      status: 'PREPARING',
      tasks: {
        create: tasks.map((t) => ({
          title: t.title,
          detail: t.detail ?? null,
          kind: t.kind,
          isRequired: t.isRequired,
          blocksSubmission: t.blocksSubmission,
          leadTimeDays: t.leadTimeDays,
          sortOrder: t.sortOrder,
        })),
      },
    },
    select: { id: true },
  })

  await prisma.savedOpportunity.upsert({
    where: { userId_opportunityId: { userId, opportunityId } },
    create: { userId, opportunityId, state: 'CONSIDERING' },
    update: { state: 'CONSIDERING' },
  })

  return { ok: true as const, applicationId: application.id, alreadyExisted: false }
}
