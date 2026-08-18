import { isHardDimension } from '@/lib/db/enums'
import type { MatchReason, ScorableProfile, ScorableRule, Verdict } from './types'

/**
 * Evaluates one structured eligibility rule against a student profile.
 *
 * Three principles, and they are the whole reason this file is pure:
 *   1. An unevaluable rule returns UNKNOWN, never MISMATCH. A source that
 *      failed to state a country restriction has not excluded anybody.
 *   2. A missing *profile* field also returns UNKNOWN, never MISMATCH. We do
 *      not fail a student for information they haven't given us.
 *   3. Every verdict carries the source's exact wording as evidence, so a
 *      mis-parse is visible to the student rather than silently authoritative.
 */

const asNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

const asStringList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null

const range = (v: unknown): { min: number | null; max: number | null } | null => {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const min = asNumber(o.min)
  const max = asNumber(o.max)
  return min === null && max === null ? null : { min, max }
}

/** Case- and whitespace-insensitive membership, for country codes and the like. */
const includesLoose = (list: string[], needle: string): boolean =>
  list.some((x) => x.trim().toLowerCase() === needle.trim().toLowerCase())

function verdictFor(rule: ScorableRule, profile: ScorableProfile): { verdict: Verdict; text: string } {
  const { dimension, operator, value } = rule

  switch (dimension) {
    case 'AGE': {
      if (profile.age === null) return unknown('Your age is not set, so this could not be checked.')
      const r = range(value)
      if (!r) return unknown('The age requirement could not be read from the source page.')
      const { min, max } = r
      const tooYoung = min !== null && profile.age < min
      const tooOld = max !== null && profile.age > max
      const stated = min !== null && max !== null ? `${min}–${max}` : min !== null ? `${min}+` : `up to ${max}`
      if (tooYoung || tooOld) {
        return { verdict: 'MISMATCH', text: `You're ${profile.age}; this is open to ages ${stated}.` }
      }
      return { verdict: 'MATCH', text: `You're ${profile.age}; this is open to ages ${stated}.` }
    }

    case 'GRADE': {
      if (profile.gradeOrYear === null) return unknown('Your grade or year is not set, so this could not be checked.')
      if (operator === 'IN') {
        const list = asStringList(value)
        if (!list) return unknown('The grade requirement could not be read from the source page.')
        const ok = includesLoose(list, String(profile.gradeOrYear))
        return {
          verdict: ok ? 'MATCH' : 'MISMATCH',
          text: ok
            ? `You're in year ${profile.gradeOrYear}, which is eligible.`
            : `You're in year ${profile.gradeOrYear}; this is open to years ${list.join(', ')}.`,
        }
      }
      const r = range(value)
      if (!r) return unknown('The grade requirement could not be read from the source page.')
      const ok = (r.min === null || profile.gradeOrYear >= r.min) && (r.max === null || profile.gradeOrYear <= r.max)
      const stated = r.min !== null && r.max !== null ? `${r.min}–${r.max}` : r.min !== null ? `${r.min}+` : `up to ${r.max}`
      return {
        verdict: ok ? 'MATCH' : 'MISMATCH',
        text: `You're in year ${profile.gradeOrYear}; this is open to years ${stated}.`,
      }
    }

    case 'EDUCATION_LEVEL': {
      if (!profile.educationLevel) return unknown('Your education level is not set, so this could not be checked.')
      const list = asStringList(value)
      if (!list) return unknown('The education-level requirement could not be read from the source page.')
      const ok = includesLoose(list, profile.educationLevel)
      return {
        verdict: operator === 'NOT_IN' ? (ok ? 'MISMATCH' : 'MATCH') : ok ? 'MATCH' : 'MISMATCH',
        text: ok
          ? 'Your education level is eligible.'
          : 'Your education level is outside the stated range for this opportunity.',
      }
    }

    case 'COUNTRY':
    case 'RESIDENCY':
    case 'CITIZENSHIP': {
      if (!profile.countryCode) return unknown('Your country is not set, so this could not be checked.')
      const list = asStringList(value)
      if (!list) return unknown('The location requirement could not be read from the source page.')
      const inList = includesLoose(list, profile.countryCode)
      const ok = operator === 'NOT_IN' ? !inList : inList
      const noun = dimension === 'COUNTRY' ? 'location' : dimension === 'RESIDENCY' ? 'residency' : 'citizenship'
      return {
        verdict: ok ? 'MATCH' : 'MISMATCH',
        text: ok
          ? `You meet the ${noun} requirement.`
          : `This is restricted by ${noun}, and your profile country is not included.`,
      }
    }

    case 'CURRICULUM': {
      if (!profile.curriculum || profile.curriculum === 'UNKNOWN') {
        return unknown('Your curriculum is not set, so this could not be checked.')
      }
      const list = asStringList(value)
      if (!list) return unknown('The curriculum requirement could not be read from the source page.')
      const ok = includesLoose(list, profile.curriculum)
      return {
        verdict: ok ? 'MATCH' : 'PARTIAL',
        text: ok
          ? 'Your curriculum is explicitly eligible.'
          : `This names ${list.join(', ')}. Yours is not listed — worth confirming with the organiser.`,
      }
    }

    case 'LANGUAGE': {
      if (profile.languages.length === 0) return unknown('Your languages are not set, so this could not be checked.')
      const list = asStringList(value)
      if (!list) return unknown('The language requirement could not be read from the source page.')
      const ok = list.some((l) => includesLoose(profile.languages, l))
      return {
        verdict: ok ? 'MATCH' : 'MISMATCH',
        text: ok
          ? 'You speak a language this is delivered in.'
          : `This is delivered in ${list.join(', ')}, which is not on your profile.`,
      }
    }

    case 'SUBJECT_BACKGROUND': {
      const list = asStringList(value)
      if (!list) return unknown('The subject requirement could not be read from the source page.')
      const held = list.filter((s) => profile.interests.some((i) => i.slug === s))
      if (held.length === list.length) {
        return { verdict: 'MATCH', text: 'You have the subject background this asks for.' }
      }
      if (held.length > 0) {
        return { verdict: 'PARTIAL', text: 'You have some of the subject background this asks for, but not all of it.' }
      }
      return { verdict: 'PARTIAL', text: 'This asks for subject background your profile does not yet show.' }
    }

    case 'PRIOR_EXPERIENCE': {
      const spec = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
      const kinds = asStringList(spec.kinds) ?? []
      const slugs = asStringList(spec.tagSlugs) ?? []
      const relevant = profile.achievements.filter(
        (a) => kinds.includes(a.kind) || a.tagSlugs.some((t) => slugs.includes(t)),
      )
      if (kinds.length === 0 && slugs.length === 0) {
        return {
          verdict: 'PARTIAL',
          text: 'This asks for prior experience. Check the wording below against your own background.',
        }
      }
      if (relevant.length === 0) {
        return {
          verdict: 'PARTIAL',
          text: 'This asks for prior experience your profile does not yet record. You may still be able to make the case.',
        }
      }
      // Deliberately PARTIAL, not MATCH: we can see that a student has related
      // experience, but we cannot judge whether it meets the organiser's bar.
      return {
        verdict: 'PARTIAL',
        text: `This asks for prior experience. Your profile shows ${relevant.length === 1 ? relevant[0]!.title : `${relevant.length} related activities`} — you may need to make that case explicitly.`,
      }
    }

    case 'SCHOOL_ENROLMENT': {
      if (!profile.educationLevel) return unknown('Your education level is not set, so this could not be checked.')
      const mustBeEnrolled = value === true
      const enrolled = profile.educationLevel !== 'GAP_YEAR'
      if (!mustBeEnrolled) return { verdict: 'MATCH', text: 'No school-enrolment requirement.' }
      return {
        verdict: enrolled ? 'MATCH' : 'MISMATCH',
        text: enrolled
          ? 'You are currently enrolled, which this requires.'
          : 'This requires current school enrolment, and your profile says you are on a gap year.',
      }
    }

    // GENDER and FINANCIAL_NEED are never auto-evaluated. Lumen does not store
    // gender, and financial need is a judgement no algorithm should make for a
    // student. Both are surfaced as the source's own words for the student to
    // read and decide on.
    case 'GENDER':
    case 'FINANCIAL_NEED':
    case 'OTHER':
    default:
      return unknown('Stated by the organiser — read the wording below and judge for yourself.')
  }
}

const unknown = (text: string) => ({ verdict: 'UNKNOWN' as const, text })

export interface RuleEvaluation extends MatchReason {
  isHard: boolean
}

export function evaluateRule(rule: ScorableRule, profile: ScorableProfile): RuleEvaluation {
  // FREE_TEXT rules carry no machine-readable value by definition.
  const { verdict, text } =
    rule.operator === 'FREE_TEXT'
      ? unknown('Stated by the organiser — read the wording below and judge for yourself.')
      : verdictFor(rule, profile)

  return {
    dimension: rule.dimension,
    verdict,
    weight: 0, // eligibility rules gate; they do not carry fit weight
    humanText: text,
    evidence: { rawText: rule.rawText, sourceUrl: rule.sourceUrl, method: rule.method },
    isHard: isHardDimension(rule.dimension),
  }
}

export interface EligibilityOutcome {
  eligible: boolean
  /** Hard MISMATCHes — the reasons a student cannot enter. */
  blocking: RuleEvaluation[]
  /** PARTIALs and soft MISMATCHes — "worth knowing before you apply". */
  concerns: RuleEvaluation[]
  /** Everything that checked out. */
  satisfied: RuleEvaluation[]
  /** Rules that could not be evaluated either way. */
  unevaluated: RuleEvaluation[]
}

export function evaluateEligibility(
  rules: ScorableRule[],
  profile: ScorableProfile,
): EligibilityOutcome {
  const evaluations = rules.map((r) => evaluateRule(r, profile))
  const blocking = evaluations.filter((e) => e.isHard && e.verdict === 'MISMATCH')
  return {
    eligible: blocking.length === 0,
    blocking,
    concerns: evaluations.filter((e) => e.verdict === 'PARTIAL' || (!e.isHard && e.verdict === 'MISMATCH')),
    satisfied: evaluations.filter((e) => e.verdict === 'MATCH'),
    unevaluated: evaluations.filter((e) => e.verdict === 'UNKNOWN'),
  }
}
