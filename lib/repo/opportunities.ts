import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/client'
import { decodeProvenance } from '@/lib/discovery/provenance'
import type { DiscoveryFilters } from '@/lib/discovery/queryPlanner'
import { triage, type TriagedDeadline } from '@/lib/intelligence/deadlines'
import { scoreMatch } from '@/lib/intelligence/match'
import type { MatchOutcome, ScorableProfile } from '@/lib/intelligence/types'
import {
  opportunityInclude,
  profileInclude,
  toScorableOpportunity,
  toScorableProfile,
  type OpportunityRecord,
} from './mappers'

/**
 * Reading the corpus.
 *
 * Ranking lives here and nowhere else, which is what lets the sponsorship rule
 * be a property of the code rather than a policy: `isSponsored` is not an input
 * to the sort, and the match score is computed without ever seeing it.
 */

export interface RankedOpportunity {
  record: OpportunityRecord
  match: MatchOutcome
  deadlines: TriagedDeadline[]
  primaryDeadline: TriagedDeadline | null
}

export async function loadProfile(userId: string): Promise<ScorableProfile> {
  const record = await prisma.studentProfile.findUnique({
    where: { userId },
    include: profileInclude,
  })
  return toScorableProfile(record)
}

/** Visible to students: everything except archived. Expired is shown, labelled. */
const VISIBLE_STATES = ['VERIFIED', 'RECENTLY_VERIFIED', 'NEEDS_REVIEW', 'UNVERIFIED', 'EXPIRED']

export function buildWhere(filters: DiscoveryFilters, includeExpired = false): Prisma.OpportunityWhereInput {
  const where: Prisma.OpportunityWhereInput = {
    verificationState: { in: includeExpired ? VISIBLE_STATES : VISIBLE_STATES.filter((s) => s !== 'EXPIRED') },
  }
  const and: Prisma.OpportunityWhereInput[] = []

  if (filters.categories.length > 0) {
    and.push({ categories: { some: { category: { slug: { in: filters.categories } } } } })
  }
  if (filters.subjects.length > 0) {
    and.push({ tags: { some: { tag: { slug: { in: filters.subjects } } } } })
  }
  if (filters.format) and.push({ format: filters.format })
  if (filters.countryCode) {
    // An online opportunity is available everywhere, so a country filter must
    // not hide it — that would be the filter quietly working against the student.
    and.push({ OR: [{ locationCountry: filters.countryCode }, { format: 'ONLINE' }, { locationCountry: null }] })
  }
  if (filters.costFree) and.push({ costType: { in: ['FREE', 'FREE_WITH_AID'] } })
  if (filters.city) and.push({ locationCity: { contains: filters.city } })
  if (filters.withinDays !== null) {
    const until = new Date(Date.now() + filters.withinDays * 86_400_000)
    and.push({
      deadlines: {
        some: { kind: { in: ['APPLICATION_DEADLINE', 'REGISTRATION_DEADLINE'] }, date: { gte: new Date(), lte: until } },
      },
    })
  }
  if (filters.keywords.length > 0) {
    and.push({
      OR: filters.keywords.flatMap((k) => [
        { title: { contains: k } },
        { summary: { contains: k } },
      ]),
    })
  }

  if (and.length > 0) where.AND = and
  return where
}

export interface SearchOptions {
  filters: DiscoveryFilters
  profile: ScorableProfile
  userId?: string
  limit?: number
  includeIneligible?: boolean
  includeExpired?: boolean
  now?: Date
}

export async function searchCorpus(opts: SearchOptions): Promise<RankedOpportunity[]> {
  const now = opts.now ?? new Date()
  const hidden = opts.userId
    ? await prisma.savedOpportunity.findMany({
        where: { userId: opts.userId, state: { in: ['HIDDEN', 'NOT_INTERESTED'] } },
        select: { opportunityId: true },
      })
    : []

  const records = await prisma.opportunity.findMany({
    where: {
      ...buildWhere(opts.filters, opts.includeExpired),
      ...(hidden.length > 0 ? { id: { notIn: hidden.map((h) => h.opportunityId) } } : {}),
    },
    include: opportunityInclude,
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })

  return rank(records, opts.profile, now, opts.includeIneligible ?? false).slice(0, opts.limit ?? 40)
}

export function rank(
  records: OpportunityRecord[],
  profile: ScorableProfile,
  now: Date,
  includeIneligible: boolean,
): RankedOpportunity[] {
  const scored = records.map((record) => {
    const match = scoreMatch(toScorableOpportunity(record), profile, now)
    const deadlines = triage(record.deadlines, now)
    const open = deadlines.filter((d) => d.actionable && d.urgency.level !== 'PASSED')
    return { record, match, deadlines, primaryDeadline: open[0] ?? null }
  })

  const visible = includeIneligible ? scored : scored.filter((s) => s.match.eligible)

  return visible.sort((a, b) => {
    // Sponsorship is not a term in this comparison, and cannot become one
    // without deleting this comment and the test that guards it.
    if (b.match.score !== a.match.score) return b.match.score - a.match.score
    const aDate = a.primaryDeadline?.date.getTime() ?? Number.POSITIVE_INFINITY
    const bDate = b.primaryDeadline?.date.getTime() ?? Number.POSITIVE_INFINITY
    if (aDate !== bDate) return aDate - bDate
    return b.record.firstSeenAt.getTime() - a.record.firstSeenAt.getTime()
  })
}

export async function loadOpportunityBySlug(slug: string) {
  return prisma.opportunity.findUnique({ where: { slug }, include: opportunityInclude })
}

export async function loadOpportunityDetail(slug: string, profile: ScorableProfile, now = new Date()) {
  const record = await loadOpportunityBySlug(slug)
  if (!record) return null

  const verifications = await prisma.verificationEvent.findMany({
    where: { opportunityId: record.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return {
    record,
    match: scoreMatch(toScorableOpportunity(record), profile, now),
    deadlines: triage(record.deadlines, now),
    provenance: decodeProvenance(record.fieldProvenance),
    verifications,
  }
}

export async function loadSavedIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.savedOpportunity.findMany({
    where: { userId, state: { in: ['SAVED', 'CONSIDERING'] } },
    select: { opportunityId: true },
  })
  return new Set(rows.map((r) => r.opportunityId))
}

export async function corpusSize(): Promise<number> {
  return prisma.opportunity.count({ where: { verificationState: { not: 'ARCHIVED' } } })
}
