import { describe, expect, it } from 'vitest'
import { evaluateEligibility } from './eligibility'
import { DIMENSION_WEIGHTS, nextActionableDeadline, scoreMatch } from './match'
import type { ScorableOpportunity, ScorableProfile } from './types'

const NOW = new Date('2026-08-18T00:00:00Z')
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

const profile = (over: Partial<ScorableProfile> = {}): ScorableProfile => ({
  age: 16,
  countryCode: 'GB',
  region: null,
  city: 'Leeds',
  educationLevel: 'SENIOR_SECONDARY',
  gradeOrYear: 12,
  curriculum: 'A_LEVELS',
  languages: ['en'],
  formatPreference: 'ANY',
  maxTravelRadiusKm: null,
  budgetCeiling: 100,
  budgetCurrency: 'GBP',
  availableFrom: null,
  availableUntil: null,
  weeklyHoursAvailable: 10,
  interests: [{ slug: 'molecular-biology', strength: 5, kind: 'SUBJECT' }],
  careerDirections: ['medicine'],
  achievements: [],
  thinAreas: [],
  ...over,
})

const opportunity = (over: Partial<ScorableOpportunity> = {}): ScorableOpportunity => ({
  id: 'o1',
  title: 'Summer Research Placement',
  format: 'IN_PERSON',
  locationCountry: 'GB',
  locationRegion: null,
  locationCity: 'Leeds',
  costType: 'FREE',
  costAmount: null,
  costCurrency: null,
  aidAvailable: null,
  durationDays: 42,
  tags: [{ slug: 'molecular-biology', weight: 1, kind: 'SUBJECT' }],
  categories: ['research'],
  rules: [],
  deadlines: [{ kind: 'APPLICATION_DEADLINE', date: inDays(20), isRollingAdmission: false }],
  isSponsored: false,
  ...over,
})

describe('hard eligibility is a gate, not a penalty', () => {
  it('marks a too-young student ineligible rather than scoring them low', () => {
    const out = scoreMatch(
      opportunity({
        rules: [
          {
            dimension: 'AGE',
            operator: 'BETWEEN',
            value: { min: 18, max: 22 },
            rawText: 'Open to students aged 18-22',
          },
        ],
      }),
      profile({ age: 16 }),
      NOW,
    )
    expect(out.eligible).toBe(false)
    expect(out.score).toBe(0)
    expect(out.ineligibleReasons).toHaveLength(1)
    expect(out.ineligibleReasons[0]!.humanText).toContain('16')
    // The source's exact wording travels with the verdict.
    expect(out.ineligibleReasons[0]!.evidence?.rawText).toBe('Open to students aged 18-22')
  })

  it('does not exclude a student for information they have not given', () => {
    const out = scoreMatch(
      opportunity({
        rules: [
          { dimension: 'AGE', operator: 'BETWEEN', value: { min: 18, max: 22 }, rawText: 'Aged 18-22' },
        ],
      }),
      profile({ age: null }),
      NOW,
    )
    expect(out.eligible).toBe(true)
    expect(out.reasons.some((r) => r.dimension === 'AGE' && r.verdict === 'UNKNOWN')).toBe(true)
  })

  it('treats a soft-dimension mismatch as a concern, not a block', () => {
    const out = evaluateEligibility(
      [{ dimension: 'CURRICULUM', operator: 'IN', value: ['IB'], rawText: 'IB students only' }],
      profile({ curriculum: 'A_LEVELS' }),
    )
    expect(out.eligible).toBe(true)
    expect(out.concerns).toHaveLength(1)
  })
})

describe('unknown dimensions leave the denominator', () => {
  it('does not punish an opportunity for failing to state its cost', () => {
    const stated = scoreMatch(opportunity({ costType: 'FREE' }), profile(), NOW)
    const silent = scoreMatch(
      opportunity({ costType: 'UNKNOWN', costAmount: null }),
      profile(),
      NOW,
    )
    // Cost is simply not part of the silent listing's score.
    expect(silent.unknownDimensions).toContain('COST')
    expect(stated.unknownDimensions).not.toContain('COST')
    // Both are strong matches; the silent one is not dragged down to ~74%.
    expect(silent.score).toBeGreaterThan(80)
  })

  it('reports lower confidence when fewer dimensions could be evaluated', () => {
    const rich = scoreMatch(
      opportunity({}),
      profile({ thinAreas: ['research'], interests: [{ slug: 'research', strength: 4, kind: 'INTEREST' }] }),
      NOW,
    )
    const thin = scoreMatch(
      opportunity({ format: 'UNKNOWN', costType: 'UNKNOWN', tags: [], deadlines: [] }),
      profile({ careerDirections: [], interests: [] }),
      NOW,
    )
    expect(thin.confidence).toBe('LOW')
    expect(rich.confidence === 'HIGH' || rich.confidence === 'MEDIUM').toBe(true)
  })

  it('never divides by zero when nothing at all can be evaluated', () => {
    const out = scoreMatch(
      opportunity({ format: 'UNKNOWN', costType: 'UNKNOWN', tags: [], categories: [], deadlines: [] }),
      profile({ interests: [], careerDirections: [], budgetCeiling: null, thinAreas: [] }),
      NOW,
    )
    expect(Number.isFinite(out.score)).toBe(true)
    expect(out.score).toBe(0)
  })
})

describe('currency is never converted', () => {
  it('declines to compare a fee against a budget in another currency', () => {
    const out = scoreMatch(
      opportunity({ costType: 'PAID', costAmount: 5000, costCurrency: 'INR' }),
      profile({ budgetCeiling: 100, budgetCurrency: 'GBP' }),
      NOW,
    )
    const cost = out.reasons.find((r) => r.dimension === 'COST')!
    expect(cost.verdict).toBe('UNKNOWN')
    expect(cost.humanText).toContain('compare these yourself')
  })

  it('compares directly when the currencies agree', () => {
    const out = scoreMatch(
      opportunity({ costType: 'PAID', costAmount: 250, costCurrency: 'GBP' }),
      profile({ budgetCeiling: 100, budgetCurrency: 'GBP' }),
      NOW,
    )
    expect(out.reasons.find((r) => r.dimension === 'COST')!.verdict).toBe('MISMATCH')
  })

  it('softens an over-budget fee when the organiser states aid is available', () => {
    const out = scoreMatch(
      opportunity({ costType: 'PAID', costAmount: 250, costCurrency: 'GBP', aidAvailable: true }),
      profile({ budgetCeiling: 100, budgetCurrency: 'GBP' }),
      NOW,
    )
    expect(out.reasons.find((r) => r.dimension === 'COST')!.verdict).toBe('PARTIAL')
  })
})

describe('deadlines', () => {
  it('ignores programme dates when finding the next thing to act on', () => {
    const opp = opportunity({
      deadlines: [
        { kind: 'PROGRAM_START', date: inDays(5), isRollingAdmission: false },
        { kind: 'APPLICATION_DEADLINE', date: inDays(30), isRollingAdmission: false },
      ],
    })
    expect(nextActionableDeadline(opp, NOW)!.kind).toBe('APPLICATION_DEADLINE')
  })

  it('flags a closed opportunity rather than leaving timing unscored', () => {
    const out = scoreMatch(
      opportunity({ deadlines: [{ kind: 'APPLICATION_DEADLINE', date: inDays(-1), isRollingAdmission: false }] }),
      profile(),
      NOW,
    )
    const timing = out.reasons.find((r) => r.dimension === 'TIMING')!
    expect(timing.verdict).toBe('MISMATCH')
    expect(timing.humanText).toContain('passed')
  })

  it('warns when a deadline is imminent instead of scoring it as a clean fit', () => {
    const out = scoreMatch(
      opportunity({ deadlines: [{ kind: 'APPLICATION_DEADLINE', date: inDays(1), isRollingAdmission: false }] }),
      profile(),
      NOW,
    )
    expect(out.reasons.find((r) => r.dimension === 'TIMING')!.verdict).toBe('PARTIAL')
  })
})

describe('determinism and explainability', () => {
  it('produces an identical result on repeated runs', () => {
    const a = scoreMatch(opportunity(), profile(), NOW)
    const b = scoreMatch(opportunity(), profile(), NOW)
    expect(a).toEqual(b)
  })

  it('gives every reason a human sentence', () => {
    const out = scoreMatch(opportunity(), profile(), NOW)
    expect(out.reasons.length).toBeGreaterThan(0)
    for (const r of out.reasons) {
      expect(r.humanText.trim().length).toBeGreaterThan(0)
    }
  })

  it('attributes the score only to dimensions it actually counted', () => {
    const out = scoreMatch(opportunity(), profile(), NOW)
    const counted = out.reasons.filter((r) => r.weight > 0)
    for (const r of counted) {
      expect(DIMENSION_WEIGHTS[r.dimension as keyof typeof DIMENSION_WEIGHTS]).toBe(r.weight)
    }
    for (const r of out.reasons.filter((x) => x.verdict === 'UNKNOWN')) {
      expect(r.weight).toBe(0)
    }
  })

  it('returns an integer score, never a false precision', () => {
    const out = scoreMatch(opportunity(), profile(), NOW)
    expect(Number.isInteger(out.score)).toBe(true)
    expect(out.score).toBeGreaterThanOrEqual(0)
    expect(out.score).toBeLessThanOrEqual(100)
  })
})

describe('prior experience is never overclaimed', () => {
  it('stays PARTIAL even when the student has related achievements', () => {
    const out = evaluateEligibility(
      [
        {
          dimension: 'PRIOR_EXPERIENCE',
          operator: 'REQUIRES',
          value: { kinds: ['PROJECT'] },
          rawText: 'Applicants should have prior research experience',
        },
      ],
      profile({
        achievements: [{ kind: 'PROJECT', level: 'SCHOOL', tagSlugs: [], title: 'School science project' }],
      }),
    )
    // Lumen can see the experience; it cannot judge the organiser's bar.
    expect(out.concerns[0]!.verdict).toBe('PARTIAL')
    expect(out.concerns[0]!.humanText).toContain('make that case')
  })
})

describe('profile balance', () => {
  it('only rewards filling a gap the student said they wanted to fill', () => {
    const wanted = scoreMatch(
      opportunity({ categories: ['research'] }),
      profile({ thinAreas: ['research'], interests: [{ slug: 'research', strength: 3, kind: 'INTEREST' }] }),
      NOW,
    )
    const unwanted = scoreMatch(
      opportunity({ categories: ['research'] }),
      profile({ thinAreas: ['research'], interests: [] }),
      NOW,
    )
    expect(wanted.unknownDimensions).not.toContain('PROFILE_GAP')
    expect(unwanted.unknownDimensions).toContain('PROFILE_GAP')
  })
})
