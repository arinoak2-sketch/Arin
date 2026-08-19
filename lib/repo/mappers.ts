import 'server-only'
import type { Prisma } from '@prisma/client'
import { decodeJson, decodeRequirements, decodeStatedBenefits, decodeStringArray } from '@/lib/db/codec'
import type { CostType, EducationLevel, Format, FormatPreference } from '@/lib/db/enums'
import type { ScorableOpportunity, ScorableProfile, ScorableRule } from '@/lib/intelligence/types'

/**
 * Maps database rows onto the plain shapes the intelligence layer works with.
 * This is the only place that knows about both, which is what keeps
 * lib/intelligence free of Prisma and therefore pure and testable.
 */

export const opportunityInclude = {
  organization: true,
  categories: { include: { category: true } },
  tags: { include: { tag: true } },
  sources: { orderBy: { isOfficial: 'desc' } },
  eligibility: true,
  deadlines: { orderBy: { date: 'asc' } },
} satisfies Prisma.OpportunityInclude

export type OpportunityRecord = Prisma.OpportunityGetPayload<{ include: typeof opportunityInclude }>

export const profileInclude = {
  tags: { include: { tag: true } },
  achievements: true,
} satisfies Prisma.StudentProfileInclude

export type ProfileRecord = Prisma.StudentProfileGetPayload<{ include: typeof profileInclude }>

/** Age at a given moment, derived from the stored date of birth so it cannot go stale. */
export function ageAt(dateOfBirth: Date | null, now: Date = new Date()): number | null {
  if (!dateOfBirth) return null
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear()
  const monthDiff = now.getUTCMonth() - dateOfBirth.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) age--
  return age >= 0 && age < 130 ? age : null
}

export function toScorableProfile(record: ProfileRecord | null, now: Date = new Date()): ScorableProfile {
  if (!record) return emptyScorableProfile()

  const achievements = record.achievements.map((a) => ({
    kind: a.kind,
    level: a.level,
    tagSlugs: decodeStringArray(a.tagSlugs),
    title: a.title,
  }))

  return {
    age: ageAt(record.dateOfBirth, now),
    countryCode: record.countryCode,
    region: record.region,
    city: record.city,
    educationLevel: (record.educationLevel as EducationLevel | null) ?? null,
    gradeOrYear: record.gradeOrYear,
    curriculum: record.curriculum,
    languages: decodeStringArray(record.languages),
    formatPreference: (record.formatPreference as FormatPreference) ?? 'ANY',
    maxTravelRadiusKm: record.maxTravelRadiusKm,
    budgetCeiling: record.budgetCeiling,
    budgetCurrency: record.budgetCurrency,
    availableFrom: record.availableFrom,
    availableUntil: record.availableUntil,
    weeklyHoursAvailable: record.weeklyHoursAvailable,
    interests: record.tags.map((t) => ({ slug: t.tag.slug, strength: t.strength, kind: t.tag.kind })),
    careerDirections: decodeStringArray(record.careerDirections),
    achievements,
    thinAreas: computeThinAreas(achievements),
  }
}

export const emptyScorableProfile = (): ScorableProfile => ({
  age: null, countryCode: null, region: null, city: null, educationLevel: null,
  gradeOrYear: null, curriculum: null, languages: [], formatPreference: 'ANY',
  maxTravelRadiusKm: null, budgetCeiling: null, budgetCurrency: null,
  availableFrom: null, availableUntil: null, weeklyHoursAvailable: null,
  interests: [], careerDirections: [], achievements: [], thinAreas: [],
})

/**
 * Areas where a student has notably less recorded activity than their strongest
 * area. Deliberately relative to the student's own profile — there is no
 * template of the ideal student to fall short of.
 */
const AREA_FROM_KIND: Record<string, string> = {
  COMPETITION: 'competition',
  PUBLICATION: 'research',
  PROJECT: 'research',
  LEADERSHIP: 'leadership',
  SERVICE: 'volunteering',
  CERTIFICATION: 'course',
  SPORT: 'sports',
  ARTS: 'arts',
}

export function computeThinAreas(achievements: Array<{ kind: string }>): string[] {
  if (achievements.length < 3) return [] // too little history to say anything
  const counts = new Map<string, number>()
  for (const area of Object.values(AREA_FROM_KIND)) counts.set(area, 0)
  for (const a of achievements) {
    const area = AREA_FROM_KIND[a.kind]
    if (area) counts.set(area, (counts.get(area) ?? 0) + 1)
  }
  const max = Math.max(...counts.values())
  if (max === 0) return []
  return [...counts.entries()].filter(([, n]) => n <= Math.floor(max / 2)).map(([area]) => area)
}

export function toScorableOpportunity(record: OpportunityRecord): ScorableOpportunity {
  const rules: ScorableRule[] = record.eligibility.map((rule) => {
    const provenance = decodeJson<{ sourceUrl?: string; method?: string }>(rule.provenance, {})
    return {
      dimension: rule.dimension as ScorableRule['dimension'],
      operator: rule.operator as ScorableRule['operator'],
      value: decodeJson<unknown>(rule.value, null),
      rawText: rule.rawText,
      sourceUrl: provenance.sourceUrl,
      method: provenance.method,
    }
  })

  return {
    id: record.id,
    title: record.title,
    format: (record.format as Format) ?? 'UNKNOWN',
    locationCountry: record.locationCountry,
    locationRegion: record.locationRegion,
    locationCity: record.locationCity,
    costType: (record.costType as CostType) ?? 'UNKNOWN',
    costAmount: record.costAmount,
    costCurrency: record.costCurrency,
    aidAvailable: record.aidAvailable,
    durationDays: record.durationDays,
    tags: record.tags.map((t) => ({ slug: t.tag.slug, weight: t.weight, kind: t.tag.kind })),
    categories: record.categories.map((c) => c.category.slug),
    rules,
    deadlines: record.deadlines.map((d) => ({
      kind: d.kind,
      date: d.date,
      endDate: d.endDate,
      isRollingAdmission: d.isRollingAdmission,
    })),
    isSponsored: record.isSponsored,
  }
}

export const requirementsOf = (record: { requirements: string }) => decodeRequirements(record.requirements)
export const statedBenefitsOf = (record: { statedBenefits: string }) => decodeStatedBenefits(record.statedBenefits)
