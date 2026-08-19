'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { runDiscovery, searchBudgetStatus } from '@/lib/discovery/pipeline'
import { parseNaturalQuery } from '@/lib/discovery/queryPlanner'
import { ageAt } from '@/lib/repo/mappers'

/**
 * Live discovery, triggered from the Discover page after the stored corpus has
 * already rendered.
 *
 * It does not fire on every page load. The Brave free tier is roughly 2,000
 * queries a month, so a repeat of a query already run recently serves the
 * corpus instead — and says so, rather than pretending it searched.
 */

const RECENT_WINDOW_MS = 6 * 60 * 60 * 1000

export interface LiveSearchResult {
  ran: boolean
  reason?: string
  created?: number
  merged?: number
  queuedForReview?: number
  queriesRun?: string[]
}

export async function runLiveSearch(rawQuery: string): Promise<LiveSearchResult> {
  const user = await requireUser()
  const query = z.string().max(200).parse(rawQuery ?? '').trim()

  const budget = await searchBudgetStatus()
  if (budget.exhausted) {
    return {
      ran: false,
      reason: `Lumen has used this month's live search allowance (${budget.used} of ${budget.limit}). These are stored results; live search resumes next month.`,
    }
  }

  const recent = await prisma.discoveryQuery.findFirst({
    where: { rawQuery: query, createdAt: { gte: new Date(Date.now() - RECENT_WINDOW_MS) }, error: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  if (recent) {
    return {
      ran: false,
      reason: `Lumen already searched the web for this ${relativeTime(recent.createdAt)}. These results include everything it found.`,
    }
  }

  const profileRecord = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
    include: { tags: { include: { tag: true } } },
  })

  const outcome = await runDiscovery({
    rawQuery: query,
    filters: parseNaturalQuery(query),
    userId: user.id,
    profile: profileRecord
      ? {
          age: ageAt(profileRecord.dateOfBirth),
          countryCode: profileRecord.countryCode,
          educationLevel: profileRecord.educationLevel,
          interests: profileRecord.tags.map((t) => t.tag.slug),
          careerDirections: [],
          formatPreference: profileRecord.formatPreference,
        }
      : null,
  })

  revalidatePath('/discover')

  if (!outcome.ok && outcome.unavailableReason) {
    return { ran: false, reason: outcome.unavailableReason }
  }
  return {
    ran: true,
    created: outcome.created,
    merged: outcome.merged,
    queuedForReview: outcome.queuedForReview,
    queriesRun: outcome.queriesRun,
  }
}

function relativeTime(at: Date): string {
  const minutes = Math.round((Date.now() - at.getTime()) / 60_000)
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.round(minutes / 60)
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
}
