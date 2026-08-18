import type { Confidence } from '@/lib/db/enums'
import { isActionableDeadline } from '@/lib/db/enums'
import { evaluateEligibility } from './eligibility'
import type {
  MatchOutcome,
  MatchReason,
  ScorableOpportunity,
  ScorableProfile,
  Verdict,
} from './types'

/**
 * The deterministic match engine.
 *
 * No network, no model, no randomness, no ambient clock — `now` is injected.
 * The same profile and the same opportunity always produce the same score and
 * the same sentences. That property is what lets us show a student *why*
 * without ever having to say "the system decided".
 *
 * Bump ENGINE_VERSION whenever weights or logic change: stored MatchResults
 * record it, so a scoring change is auditable instead of silently rewriting
 * every student's history.
 */
export const ENGINE_VERSION = 'match@1.0.0'

export const DIMENSION_WEIGHTS = {
  SUBJECT: 30,
  CAREER: 15,
  FORMAT_LOCATION: 12,
  COST: 12,
  TIMING: 12,
  EXPERIENCE: 10,
  PROFILE_GAP: 9,
} as const

export const DIMENSION_LABELS: Record<keyof typeof DIMENSION_WEIGHTS, string> = {
  SUBJECT: 'Subject fit',
  CAREER: 'Career direction',
  FORMAT_LOCATION: 'Format and location',
  COST: 'Cost',
  TIMING: 'Timing',
  EXPERIENCE: 'Experience level',
  PROFILE_GAP: 'Profile balance',
}

type DimensionKey = keyof typeof DIMENSION_WEIGHTS

interface DimensionScore {
  dimension: DimensionKey
  /** null means "could not be evaluated" — excluded from the denominator. */
  value: number | null
  humanText: string
  /** Overrides the value-derived verdict where the distinction matters. */
  verdictOverride?: Verdict
}

const verdictFromValue = (v: number): Verdict =>
  v >= 0.75 ? 'MATCH' : v >= 0.35 ? 'PARTIAL' : 'MISMATCH'

const DAY_MS = 86_400_000
export const daysUntil = (date: Date, now: Date): number =>
  Math.floor((date.getTime() - now.getTime()) / DAY_MS)

/** The soonest deadline a student must actually act on. Programme dates are not deadlines. */
export function nextActionableDeadline(opp: ScorableOpportunity, now: Date) {
  return opp.deadlines
    .filter((d) => isActionableDeadline(d.kind) && !d.isRollingAdmission)
    .filter((d) => d.date.getTime() >= now.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0]
}

// ── Dimensions ───────────────────────────────────────────────────────────────

function scoreSubject(opp: ScorableOpportunity, p: ScorableProfile): DimensionScore {
  const topical = opp.tags.filter((t) => t.kind === 'SUBJECT' || t.kind === 'INTEREST')
  if (topical.length === 0) {
    return { dimension: 'SUBJECT', value: null, humanText: 'This listing does not state a subject area.' }
  }
  if (p.interests.length === 0) {
    return { dimension: 'SUBJECT', value: null, humanText: 'Add your interests and Lumen can judge subject fit.' }
  }

  const total = topical.reduce((s, t) => s + t.weight, 0)
  const matched: string[] = []
  let earned = 0
  for (const tag of topical) {
    const held = p.interests.find((i) => i.slug === tag.slug)
    if (!held) continue
    matched.push(tag.slug)
    // A stated interest counts; a strongly-held one counts more, but never
    // less than 60% — a student who ticked a box still meant it.
    earned += tag.weight * (0.6 + 0.4 * (held.strength / 5))
  }
  const value = Math.min(1, earned / total)

  const names = matched.slice(0, 2).map(humanise).join(' and ')
  const humanText =
    matched.length === 0
      ? 'None of your stated interests match this listing’s subject areas.'
      : matched.length <= 2
        ? `Matches your interest in ${names}.`
        : `Matches ${matched.length} of your interests, including ${names}.`

  return { dimension: 'SUBJECT', value, humanText }
}

function scoreCareer(opp: ScorableOpportunity, p: ScorableProfile): DimensionScore {
  if (p.careerDirections.length === 0) {
    return { dimension: 'CAREER', value: null, humanText: 'Add a career direction and Lumen can weigh this.' }
  }
  const fields = opp.tags.filter((t) => t.kind === 'CAREER_FIELD').map((t) => t.slug)
  const pool = [...fields, ...opp.categories]
  if (pool.length === 0) {
    return { dimension: 'CAREER', value: null, humanText: 'This listing does not state a career field.' }
  }
  const hits = p.careerDirections.filter((c) => pool.includes(c))
  if (hits.length === 0) {
    return {
      dimension: 'CAREER',
      value: 0.2,
      humanText: 'Outside the career directions on your profile — which can still be a good reason to try it.',
      verdictOverride: 'PARTIAL',
    }
  }
  return {
    dimension: 'CAREER',
    value: Math.min(1, 0.7 + 0.3 * hits.length),
    humanText: `Points at ${humanise(hits[0]!)}, which you've named as a direction.`,
  }
}

function scoreFormatLocation(opp: ScorableOpportunity, p: ScorableProfile): DimensionScore {
  if (opp.format === 'UNKNOWN') {
    return { dimension: 'FORMAT_LOCATION', value: null, humanText: 'Format is not stated on the source page.' }
  }
  if (opp.format === 'ONLINE') {
    const wanted = p.formatPreference === 'ONLINE' || p.formatPreference === 'ANY' || p.formatPreference === 'HYBRID'
    return {
      dimension: 'FORMAT_LOCATION',
      value: wanted ? 1 : 0.5,
      humanText: wanted
        ? 'Runs online, so location is not a barrier.'
        : 'Runs online, though your profile prefers in-person.',
    }
  }

  // In-person or hybrid: location actually matters.
  if (p.formatPreference === 'ONLINE') {
    return {
      dimension: 'FORMAT_LOCATION',
      value: 0.15,
      humanText: 'Requires attending in person, and your profile prefers online.',
    }
  }
  if (!p.countryCode || !opp.locationCountry) {
    return { dimension: 'FORMAT_LOCATION', value: null, humanText: 'Location could not be compared with your profile.' }
  }
  const sameCountry = p.countryCode.toLowerCase() === opp.locationCountry.toLowerCase()
  if (!sameCountry) {
    return {
      dimension: 'FORMAT_LOCATION',
      value: 0.25,
      humanText: 'Held in another country — factor in travel, cost and any visa you would need.',
      verdictOverride: 'PARTIAL',
    }
  }
  const sameCity =
    !!p.city && !!opp.locationCity && p.city.trim().toLowerCase() === opp.locationCity.trim().toLowerCase()
  return {
    dimension: 'FORMAT_LOCATION',
    value: sameCity ? 1 : 0.8,
    humanText: sameCity ? `Held in ${opp.locationCity}, where you are.` : 'Held in your country.',
  }
}

function scoreCost(opp: ScorableOpportunity, p: ScorableProfile): DimensionScore {
  if (opp.costType === 'FREE') {
    return { dimension: 'COST', value: 1, humanText: 'Free to enter.' }
  }
  if (opp.costType === 'UNKNOWN' || (opp.costType === 'PAID' && opp.costAmount === null)) {
    return { dimension: 'COST', value: null, humanText: 'Cost is not stated on the source page.' }
  }
  if (opp.costType === 'FREE_WITH_AID') {
    return { dimension: 'COST', value: 0.9, humanText: 'Paid, but the organiser states financial aid is available.' }
  }
  if (p.budgetCeiling === null) {
    return { dimension: 'COST', value: null, humanText: 'Set a budget and Lumen can tell you whether this fits it.' }
  }
  // No FX rates are used anywhere in Lumen. Converting currencies with a rate
  // we cannot cite would be fabricating a number the student might act on.
  if (opp.costCurrency && p.budgetCurrency && opp.costCurrency !== p.budgetCurrency) {
    return {
      dimension: 'COST',
      value: null,
      humanText: `Priced in ${opp.costCurrency}, and your budget is in ${p.budgetCurrency} — compare these yourself.`,
    }
  }
  const amount = opp.costAmount!
  if (amount <= p.budgetCeiling) {
    return { dimension: 'COST', value: 1, humanText: 'Within the budget on your profile.' }
  }
  if (opp.aidAvailable) {
    return {
      dimension: 'COST',
      value: 0.5,
      humanText: 'Above your budget, though the organiser states financial aid is available.',
      verdictOverride: 'PARTIAL',
    }
  }
  return { dimension: 'COST', value: 0, humanText: 'Costs more than the budget on your profile.' }
}

function scoreTiming(opp: ScorableOpportunity, p: ScorableProfile, now: Date): DimensionScore {
  const rolling = opp.deadlines.some((d) => d.isRollingAdmission && isActionableDeadline(d.kind))
  const next = nextActionableDeadline(opp, now)

  if (!next && !rolling) {
    const anyPast = opp.deadlines.some((d) => isActionableDeadline(d.kind))
    return anyPast
      ? { dimension: 'TIMING', value: 0, humanText: 'The application deadline has passed.', verdictOverride: 'MISMATCH' }
      : { dimension: 'TIMING', value: null, humanText: 'No application deadline is stated on the source page.' }
  }

  // Programme dates against the student's stated availability.
  const start = opp.deadlines.find((d) => d.kind === 'PROGRAM_START')
  if (start && (p.availableFrom || p.availableUntil)) {
    const before = p.availableFrom && start.date < p.availableFrom
    const after = p.availableUntil && start.date > p.availableUntil
    if (before || after) {
      return {
        dimension: 'TIMING',
        value: 0.25,
        humanText: 'The programme runs outside the availability window on your profile.',
        verdictOverride: 'PARTIAL',
      }
    }
  }

  if (rolling && !next) {
    return { dimension: 'TIMING', value: 0.9, humanText: 'Rolling admissions — no fixed deadline to race.' }
  }

  const days = daysUntil(next!.date, now)
  if (days <= 2) {
    return {
      dimension: 'TIMING',
      value: 0.3,
      humanText: `Closes in ${days <= 0 ? 'under a day' : `${days} days`} — only worth starting if you can move fast.`,
      verdictOverride: 'PARTIAL',
    }
  }
  if (days <= 7) return { dimension: 'TIMING', value: 0.65, humanText: `Closes in ${days} days — tight but workable.` }
  if (days <= 30) return { dimension: 'TIMING', value: 1, humanText: `Closes in ${days} days, which is comfortable.` }
  return { dimension: 'TIMING', value: 0.95, humanText: `Closes in ${Math.round(days / 7)} weeks — plenty of runway.` }
}

function scoreExperience(opp: ScorableOpportunity, p: ScorableProfile): DimensionScore {
  const rules = opp.rules.filter((r) => r.dimension === 'PRIOR_EXPERIENCE')
  if (rules.length === 0) {
    return { dimension: 'EXPERIENCE', value: null, humanText: 'No prior experience requirement is stated.' }
  }
  const wanted = new Set<string>()
  for (const r of rules) {
    const spec = (typeof r.value === 'object' && r.value !== null ? r.value : {}) as Record<string, unknown>
    for (const k of Array.isArray(spec.kinds) ? spec.kinds : []) if (typeof k === 'string') wanted.add(k)
  }
  if (wanted.size === 0) {
    return {
      dimension: 'EXPERIENCE',
      value: 0.5,
      humanText: 'Asks for prior experience without specifying what — read the requirement below.',
      verdictOverride: 'PARTIAL',
    }
  }
  const held = p.achievements.filter((a) => wanted.has(a.kind))
  if (held.length === 0) {
    return {
      dimension: 'EXPERIENCE',
      value: 0.25,
      humanText: 'Asks for experience your profile does not yet record.',
      verdictOverride: 'PARTIAL',
    }
  }
  const national = held.some((a) => a.level === 'NATIONAL' || a.level === 'INTERNATIONAL')
  return {
    dimension: 'EXPERIENCE',
    value: national ? 1 : 0.75,
    humanText: `Your profile already records ${held.length === 1 ? 'relevant experience' : `${held.length} relevant activities`}.`,
  }
}

/**
 * Rewards an opportunity that fills a thin area of the student's profile —
 * but only when they have expressed interest in that area. Lumen does not have
 * an opinion about what a well-rounded student looks like; it only helps a
 * student move toward what they said they wanted.
 */
function scoreProfileGap(opp: ScorableOpportunity, p: ScorableProfile): DimensionScore {
  if (p.thinAreas.length === 0) {
    return { dimension: 'PROFILE_GAP', value: null, humanText: 'Not enough profile history to judge balance yet.' }
  }
  const fills = opp.categories.filter((c) => p.thinAreas.includes(c))
  const wanted = fills.filter((c) => p.interests.some((i) => i.slug === c) || p.careerDirections.includes(c))
  if (wanted.length === 0) {
    return { dimension: 'PROFILE_GAP', value: null, humanText: 'Does not target a gap you have said you want to close.' }
  }
  return {
    dimension: 'PROFILE_GAP',
    value: 1,
    humanText: `You have less ${humanise(wanted[0]!)} experience than your other areas, and you've said you want more of it.`,
  }
}

// ── Composition ──────────────────────────────────────────────────────────────

export function scoreMatch(
  opp: ScorableOpportunity,
  profile: ScorableProfile,
  now: Date = new Date(),
): MatchOutcome {
  const eligibility = evaluateEligibility(opp.rules, profile)

  const dimensions: DimensionScore[] = [
    scoreSubject(opp, profile),
    scoreCareer(opp, profile),
    scoreFormatLocation(opp, profile),
    scoreCost(opp, profile),
    scoreTiming(opp, profile, now),
    scoreExperience(opp, profile),
    scoreProfileGap(opp, profile),
  ]

  const evaluable = dimensions.filter((d) => d.value !== null)
  const denominator = evaluable.reduce((s, d) => s + DIMENSION_WEIGHTS[d.dimension], 0)
  const numerator = evaluable.reduce((s, d) => s + DIMENSION_WEIGHTS[d.dimension] * d.value!, 0)

  // An integer. Decimal places would imply a precision this has not earned.
  const score = denominator === 0 ? 0 : Math.round((numerator / denominator) * 100)

  const confidence: Confidence =
    evaluable.length >= 6 ? 'HIGH' : evaluable.length >= 4 ? 'MEDIUM' : 'LOW'

  const fitReasons: MatchReason[] = dimensions.map((d) => ({
    dimension: d.dimension,
    verdict: d.value === null ? 'UNKNOWN' : (d.verdictOverride ?? verdictFromValue(d.value)),
    weight: d.value === null ? 0 : DIMENSION_WEIGHTS[d.dimension],
    humanText: d.humanText,
  }))

  // Eligibility verdicts lead: they are grounded in the source's own words.
  const reasons: MatchReason[] = [
    ...eligibility.satisfied,
    ...fitReasons.filter((r) => r.verdict === 'MATCH'),
    ...eligibility.concerns,
    ...fitReasons.filter((r) => r.verdict === 'PARTIAL' || r.verdict === 'MISMATCH'),
    ...fitReasons.filter((r) => r.verdict === 'UNKNOWN'),
    ...eligibility.unevaluated,
  ].map(({ dimension, verdict, weight, humanText, evidence }) => ({
    dimension,
    verdict,
    weight,
    humanText,
    evidence,
  }))

  return {
    // An ineligible opportunity is not given a fit score. Showing "62%" next to
    // something a student literally cannot enter is a lie of omission.
    score: eligibility.eligible ? score : 0,
    confidence,
    eligible: eligibility.eligible,
    ineligibleReasons: eligibility.blocking.map(({ isHard: _isHard, ...r }) => r),
    reasons,
    unknownDimensions: dimensions.filter((d) => d.value === null).map((d) => d.dimension),
    engineVersion: ENGINE_VERSION,
  }
}

function humanise(slug: string): string {
  return slug.replace(/[-_]/g, ' ')
}
