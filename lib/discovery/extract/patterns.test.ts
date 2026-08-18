import { describe, expect, it } from 'vitest'
import {
  classifyDateKind,
  extractAgeRange,
  extractCost,
  extractDates,
  extractFormat,
  extractRequirements,
  parseDate,
} from './patterns'

const iso = (d: Date) => d.toISOString().slice(0, 10)

describe('date parsing refuses to guess', () => {
  it('reads unambiguous formats', () => {
    expect(iso(parseDate('Applications close 12 September 2026')!.date)).toBe('2026-09-12')
    expect(iso(parseDate('Deadline: September 12, 2026')!.date)).toBe('2026-09-12')
    expect(iso(parseDate('closes 2026-09-12')!.date)).toBe('2026-09-12')
    expect(iso(parseDate('due 12th Sept 2026')!.date)).toBe('2026-09-12')
  })

  it('REFUSES an ambiguous numeric date rather than picking a convention', () => {
    // 09/12/2026 is 9 December or 12 September depending on the writer.
    // Three months apart, and nothing on the page says which.
    expect(parseDate('Deadline 09/12/2026')).toBeNull()
    expect(parseDate('Deadline 01/02/2026')).toBeNull()
  })

  it('accepts a numeric date once one component disambiguates it', () => {
    expect(iso(parseDate('Deadline 25/09/2026')!.date)).toBe('2026-09-25')
    expect(iso(parseDate('Deadline 09/25/2026')!.date)).toBe('2026-09-25')
  })

  it('rejects impossible dates instead of rolling them over', () => {
    expect(parseDate('31 February 2026')).toBeNull()
    expect(parseDate('2026-02-31')).toBeNull()
  })

  it('will not invent a year that is not on the page', () => {
    expect(parseDate('Applications close 12 September')).toBeNull()
    expect(iso(parseDate('Applications close 12 September', 2027)!.date)).toBe('2027-09-12')
  })

  it('keeps the exact substring it parsed', () => {
    expect(parseDate('Applications close 12 September 2026.')!.rawText).toBe('12 September 2026')
  })
})

describe('date kind classification', () => {
  it('separates deadlines from programme dates', () => {
    expect(classifyDateKind('The application deadline is 12 September 2026')).toBe('APPLICATION_DEADLINE')
    expect(classifyDateKind('The programme begins on 1 July 2026')).toBe('PROGRAM_START')
    expect(classifyDateKind('Results announced 3 October 2026')).toBe('RESULT_DATE')
    expect(classifyDateKind('Interviews will be held in August')).toBe('INTERVIEW_WINDOW')
  })

  it('returns null for a date with no stated purpose', () => {
    // A bare date must never be assumed to be the application deadline.
    expect(classifyDateKind('Founded in 1994 by a group of teachers')).toBeNull()
    expect(classifyDateKind('The 2026 cohort will be our tenth')).toBeNull()
  })

  it('extracts only labelled dates from a page', () => {
    const dates = extractDates(
      'Founded 12 March 1994. The application deadline is 12 September 2026. ' +
        'The programme begins on 1 July 2027. We had 400 applicants in 2025.',
    )
    const kinds = dates.map((d) => d.kind)
    expect(kinds).toContain('APPLICATION_DEADLINE')
    expect(kinds).toContain('PROGRAM_START')
    expect(dates).toHaveLength(2)
    expect(iso(dates.find((d) => d.kind === 'APPLICATION_DEADLINE')!.date)).toBe('2026-09-12')
  })

  it('recognises rolling admissions rather than fabricating a date', () => {
    const [d] = extractDates('Applications are accepted on a rolling basis until places are filled.')
    expect(d!.isRollingAdmission).toBe(true)
  })
})

describe('age ranges', () => {
  it('reads the common phrasings', () => {
    expect(extractAgeRange('Open to students aged 14-18')).toMatchObject({ min: 14, max: 18 })
    expect(extractAgeRange('for ages 13 to 17')).toMatchObject({ min: 13, max: 17 })
    expect(extractAgeRange('a programme for 16-18 year olds')).toMatchObject({ min: 16, max: 18 })
    expect(extractAgeRange('applicants must be under 18')).toMatchObject({ min: null, max: 17 })
    expect(extractAgeRange('applicants must be at least 16 years old')).toMatchObject({ min: 16, max: null })
  })

  it('ignores numbers that are not ages', () => {
    expect(extractAgeRange('a 4 week programme with 200 participants')).toBeNull()
    expect(extractAgeRange('established 1994')).toBeNull()
  })

  it('rejects a reversed range instead of silently swapping it', () => {
    expect(extractAgeRange('aged 18-14')).toBeNull()
  })
})

describe('cost extraction is conservative', () => {
  it('reads a fee only when it is attached to fee wording', () => {
    expect(extractCost('The application fee is £20.')).toMatchObject({ costType: 'PAID', amount: 20, currency: 'GBP' })
    expect(extractCost('Programme cost: ₹5,000 per participant')).toMatchObject({
      costType: 'PAID', amount: 5000, currency: 'INR',
    })
  })

  it('ignores unrelated numbers on the page', () => {
    // A prize is not a fee. This is exactly the mistake that would show a
    // student "costs $10,000" on a free competition.
    expect(extractCost('The winner receives a $10,000 prize.').costType).toBe('UNKNOWN')
    expect(extractCost('Over 5,000 students took part last year.').costType).toBe('UNKNOWN')
  })

  it('recognises free and aid-available wording', () => {
    expect(extractCost('There is no application fee.').costType).toBe('FREE')
    expect(extractCost('The programme is free of charge.').costType).toBe('FREE')
    expect(extractCost('Fee waivers and bursaries are available.').costType).toBe('FREE_WITH_AID')
  })

  it('marks a fee with aid as aid-available rather than plain paid', () => {
    expect(extractCost('The fee is £250, and financial aid is available.')).toMatchObject({
      costType: 'FREE_WITH_AID', amount: 250, currency: 'GBP',
    })
  })

  it('returns UNKNOWN when the page says nothing about money', () => {
    expect(extractCost('A six week research placement in molecular biology.').costType).toBe('UNKNOWN')
  })
})

describe('format', () => {
  it('reads the stated delivery mode', () => {
    expect(extractFormat('This is a fully online programme').format).toBe('ONLINE')
    expect(extractFormat('Participants attend in person in Leeds').format).toBe('IN_PERSON')
    expect(extractFormat('A hybrid programme').format).toBe('HYBRID')
  })

  it('calls it hybrid when both are mentioned', () => {
    expect(extractFormat('Sessions run online, with one residential weekend on campus').format).toBe('HYBRID')
  })

  it('does not guess when nothing is stated', () => {
    expect(extractFormat('A six week research placement').format).toBe('UNKNOWN')
  })
})

describe('requirements', () => {
  it('picks up what an applicant must produce', () => {
    const reqs = extractRequirements(
      'Applicants must submit two letters of recommendation. ' +
        'An academic transcript is required. Please include a personal statement of 500 words.',
    )
    const labels = reqs.map((r) => r.label.toLowerCase())
    expect(labels.some((l) => l.includes('recommendation'))).toBe(true)
    expect(labels.some((l) => l.includes('transcript'))).toBe(true)
    expect(labels.some((l) => l.includes('personal statement'))).toBe(true)
  })

  it('keeps the sentence each requirement came from', () => {
    const [first] = extractRequirements('Applicants must submit two letters of recommendation.')
    expect(first!.rawText).toContain('two letters of recommendation')
  })

  it('finds nothing in a page that states nothing', () => {
    expect(extractRequirements('A six week placement in Leeds.')).toHaveLength(0)
  })
})
