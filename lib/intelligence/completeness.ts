import type { ScorableProfile } from './types'

/**
 * Profile completeness, expressed in terms of what each field unlocks.
 *
 * A percentage on its own is a nag. A percentage next to "add your budget and
 * Lumen can stop showing you programmes you'd have to withdraw from" is a
 * reason. So every field carries the sentence that justifies asking for it.
 */

export interface CompletenessField {
  key: string
  prompt: string
  unlocks: string
  weight: number
  filled: boolean
}

export interface CompletenessOutcome {
  score: number
  fields: CompletenessField[]
  /** The highest-value field still missing, or null when nothing is left. */
  nextField: CompletenessField | null
}

interface ProfileRow {
  dateOfBirth: Date | null
  countryCode: string | null
  educationLevel: string | null
  gradeOrYear: number | null
  budgetCeiling: number | null
  availableFrom: Date | null
  formatPreference: string
}

export function profileCompleteness(
  row: ProfileRow | null,
  profile: ScorableProfile,
): CompletenessOutcome {
  const fields: CompletenessField[] = [
    {
      key: 'dateOfBirth',
      prompt: 'Add your date of birth',
      unlocks: 'Age is the single most common eligibility rule — without it Lumen cannot rule anything in or out.',
      weight: 22,
      filled: row?.dateOfBirth != null,
    },
    {
      key: 'countryCode',
      prompt: 'Add your country',
      unlocks: 'Lets Lumen filter out opportunities restricted to other countries, and find ones local to you.',
      weight: 18,
      filled: !!row?.countryCode,
    },
    {
      key: 'interests',
      prompt: 'Add a few interests',
      unlocks: 'Subject fit is the largest part of your match score. Two or three is enough to start.',
      weight: 22,
      filled: profile.interests.length >= 2,
    },
    {
      key: 'educationLevel',
      prompt: 'Add your year or grade',
      unlocks: 'Many programmes are open only to specific years. This turns a maybe into a yes or no.',
      weight: 14,
      filled: !!row?.educationLevel || row?.gradeOrYear != null,
    },
    {
      key: 'budget',
      prompt: 'Set a budget',
      unlocks: 'Stops Lumen recommending things you would have to withdraw from later.',
      weight: 10,
      filled: row?.budgetCeiling != null,
    },
    {
      key: 'availability',
      prompt: 'Add when you are free',
      unlocks: 'Lets Lumen check programme dates against your term times, not just the deadline.',
      weight: 8,
      filled: row?.availableFrom != null,
    },
    {
      key: 'careerDirections',
      prompt: 'Name a direction you are curious about',
      unlocks: 'Used to explain why something is worth your time, not just whether you can enter.',
      weight: 6,
      filled: profile.careerDirections.length > 0,
    },
  ]

  const total = fields.reduce((s, f) => s + f.weight, 0)
  const earned = fields.filter((f) => f.filled).reduce((s, f) => s + f.weight, 0)

  const missing = fields.filter((f) => !f.filled).sort((a, b) => b.weight - a.weight)

  return {
    score: Math.round((earned / total) * 100),
    fields,
    nextField: missing[0] ?? null,
  }
}

/**
 * Profile strength by area — shown as "here is what you have" rather than
 * measured against a template of the ideal student, which does not exist.
 */
export interface StrengthArea {
  key: string
  label: string
  count: number
  /** 0–100, relative to the student's own strongest area. */
  relative: number
}

const AREAS: Array<[string, string, string[]]> = [
  ['academics', 'Academics', ['PUBLICATION', 'CERTIFICATION']],
  ['competitions', 'Competitions', ['COMPETITION']],
  ['research', 'Research', ['PROJECT', 'PUBLICATION']],
  ['leadership', 'Leadership', ['LEADERSHIP']],
  ['community', 'Community', ['SERVICE']],
  ['creative', 'Creative', ['ARTS']],
  ['sport', 'Sport', ['SPORT']],
]

export function profileStrength(achievements: Array<{ kind: string }>): StrengthArea[] {
  const counts = AREAS.map(([key, label, kinds]) => ({
    key,
    label,
    count: achievements.filter((a) => kinds.includes(a.kind)).length,
    relative: 0,
  }))
  const max = Math.max(1, ...counts.map((c) => c.count))
  return counts.map((c) => ({ ...c, relative: Math.round((c.count / max) * 100) }))
}
