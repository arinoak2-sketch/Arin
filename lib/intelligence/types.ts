import type {
  Confidence,
  CostType,
  EligibilityDimension,
  EligibilityOperator,
  Format,
  FormatPreference,
  EducationLevel,
} from '@/lib/db/enums'

/**
 * Everything in lib/intelligence operates on these plain shapes, never on
 * Prisma models directly. That keeps the whole layer pure and unit-testable:
 * no database, no network, no clock beyond an injected `now`.
 */

export type Verdict = 'MATCH' | 'PARTIAL' | 'MISMATCH' | 'UNKNOWN'

/** Where a claim came from, carried all the way to the student's screen. */
export interface Evidence {
  /** The source's own words. Never paraphrased. */
  rawText?: string
  sourceUrl?: string
  method?: string
}

export interface MatchReason {
  dimension: string
  verdict: Verdict
  /** Weight this dimension contributed. 0 when UNKNOWN (excluded entirely). */
  weight: number
  /** Deterministic template output — never model prose. */
  humanText: string
  evidence?: Evidence
}

export interface MatchOutcome {
  score: number
  confidence: Confidence
  /** False when a hard eligibility rule is failed: not a low score, a gate. */
  eligible: boolean
  /** Populated only when `eligible` is false. */
  ineligibleReasons: MatchReason[]
  reasons: MatchReason[]
  /** Dimensions that could not be evaluated, excluded from the denominator. */
  unknownDimensions: string[]
  engineVersion: string
}

export interface ProfileAchievement {
  kind: string
  level?: string | null
  tagSlugs: string[]
  title: string
}

/** A student profile, resolved and ready to score against. */
export interface ScorableProfile {
  /** Derived from date of birth at scoring time, never stored. */
  age: number | null
  countryCode: string | null
  region: string | null
  city: string | null
  educationLevel: EducationLevel | null
  gradeOrYear: number | null
  curriculum: string | null
  languages: string[]
  formatPreference: FormatPreference
  maxTravelRadiusKm: number | null
  budgetCeiling: number | null
  budgetCurrency: string | null
  availableFrom: Date | null
  availableUntil: Date | null
  weeklyHoursAvailable: number | null
  /** Tag slugs the student cares about, with 1–5 strength. */
  interests: Array<{ slug: string; strength: number; kind: string }>
  careerDirections: string[]
  achievements: ProfileAchievement[]
  /** Dimensions the student is thin in — powers the profile-gap bonus. */
  thinAreas: string[]
}

export interface ScorableRule {
  dimension: EligibilityDimension
  operator: EligibilityOperator
  /** Already-parsed JSON value. Shape depends on dimension + operator. */
  value: unknown
  rawText: string
  sourceUrl?: string
  method?: string
}

export interface ScorableDeadline {
  kind: string
  date: Date
  endDate?: Date | null
  isRollingAdmission: boolean
}

export interface ScorableOpportunity {
  id: string
  title: string
  format: Format
  locationCountry: string | null
  locationRegion: string | null
  locationCity: string | null
  costType: CostType
  costAmount: number | null
  costCurrency: string | null
  aidAvailable: boolean | null
  durationDays: number | null
  /** Tag slugs with relative weights. */
  tags: Array<{ slug: string; weight: number; kind: string }>
  categories: string[]
  rules: ScorableRule[]
  deadlines: ScorableDeadline[]
  isSponsored: boolean
}
