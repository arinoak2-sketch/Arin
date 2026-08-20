import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The AI gap-fill stage.
 *
 * This is the only place in the pipeline where text Lumen did not read off the
 * page can reach a student, so it is the tier with the most to prove. The
 * model is mocked throughout: these tests are about the guards, not about
 * whether a model behaves — a guard that only works when the model cooperates
 * is not a guard.
 *
 * The question each test asks is the same one: if the model returns something
 * untrue, does it reach the corpus?
 */

const callStructured = vi.fn()
const isAvailable = vi.fn(() => true)

vi.mock('@/lib/ai/provider', () => ({
  callStructured: (...args: unknown[]) => callStructured(...args),
  isAvailable: () => isAvailable(),
}))

const { appearsVerbatim, fillGapsWithAi } = await import('./ai')
const { extractFromHtml } = await import('./structured')

const FETCHED = new Date('2026-03-01T00:00:00Z')

/** An extraction result with nothing found, carrying the given page text. */
function emptyResultWith(text: string) {
  const html = `<!doctype html><html><body><p>${text}</p></body></html>`
  const r = extractFromHtml(html, 'https://example.org/p', FETCHED)
  // Strip anything the deterministic stages found, so each test isolates the
  // AI stage rather than accidentally testing the fallbacks.
  r.title = null
  r.summary = null
  r.organizerName = null
  r.format = null
  r.costType = null
  r.costAmount = null
  r.ageRange = null
  r.deadlines = []
  r.requirements = []
  r.gaps = ['title', 'summary', 'organizerName', 'format', 'costType', 'ageRange', 'applicationDeadline', 'requirements']
  return r
}

const model = (fields: Record<string, unknown>) => {
  callStructured.mockResolvedValueOnce({
    title: null, summary: null, organizerName: null, format: null,
    applicationDeadlineText: null, ageMin: null, ageMax: null, ageRangeText: null,
    costText: null, requirements: [], statedBenefits: [],
    ...fields,
  })
}

beforeEach(() => {
  callStructured.mockReset()
  isAvailable.mockReturnValue(true)
})

describe('appearsVerbatim', () => {
  const source = 'Applications close on 3 March 2027. The programme is “free” for all — no fee.'

  it('accepts an exact quotation', () => {
    expect(appearsVerbatim('Applications close on 3 March 2027', source)).toBe(true)
  })

  it('ignores case and whitespace differences', () => {
    expect(appearsVerbatim('applications   CLOSE  on 3 march 2027', source)).toBe(true)
  })

  it('treats curly and straight quotes as the same character', () => {
    expect(appearsVerbatim('is "free" for all', source)).toBe(true)
  })

  it('treats dashes of different widths as the same character', () => {
    expect(appearsVerbatim('for all - no fee', source)).toBe(true)
  })

  it('rejects text that is not in the source', () => {
    expect(appearsVerbatim('Applications close on 3 April 2027', source)).toBe(false)
  })

  it('rejects a value too short to be meaningful', () => {
    // Two characters match almost any page by accident.
    expect(appearsVerbatim('on', source)).toBe(false)
  })
})

describe('fillGapsWithAi — when it runs at all', () => {
  it('does nothing without a configured key', async () => {
    isAvailable.mockReturnValue(false)
    const r = emptyResultWith('Applications close on 3 March 2027.')
    const report = await fillGapsWithAi(r, 'https://example.org/p', FETCHED)
    expect(report.attempted).toBe(false)
    expect(callStructured).not.toHaveBeenCalled()
  })

  it('does nothing when the deterministic stages left no gaps', async () => {
    const r = emptyResultWith('Applications close on 3 March 2027.')
    r.gaps = []
    const report = await fillGapsWithAi(r, 'https://example.org/p', FETCHED)
    expect(report.attempted).toBe(false)
    expect(callStructured).not.toHaveBeenCalled()
  })

  it('does not spend a call on a page with almost no text', async () => {
    const r = emptyResultWith('Too short.')
    const report = await fillGapsWithAi(r, 'https://example.org/p', FETCHED)
    expect(report.attempted).toBe(false)
  })
})

const LONG = 'x'.repeat(400)

describe('fillGapsWithAi — the verbatim guard', () => {
  it('stores a title the page actually contains', async () => {
    const r = emptyResultWith(`Summer Research Placement is open. ${LONG}`)
    model({ title: 'Summer Research Placement' })
    const report = await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    expect(r.title?.value).toBe('Summer Research Placement')
    expect(r.title?.provenance.method).toBe('AI_EXTRACTED')
    expect(report.filled).toContain('title')
  })

  it('discards a title the page does not contain', async () => {
    const r = emptyResultWith(`Some unrelated words here. ${LONG}`)
    model({ title: 'Oxford Summer Science Academy' })
    const report = await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    expect(r.title).toBeNull()
    expect(report.rejected.join(' ')).toMatch(/Oxford Summer Science Academy/)
  })

  it('never overwrites something the markup already established', async () => {
    const r = emptyResultWith(`Real Title From Page. ${LONG}`)
    r.title = { value: 'From markup', provenance: { method: 'STRUCTURED_MARKUP', sourceUrl: 'u', confidence: 'HIGH', at: '' } }
    model({ title: 'Real Title From Page' })
    await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    expect(r.title.value).toBe('From markup')
  })
})

describe('fillGapsWithAi — the deadline, which matters most', () => {
  it('accepts a quoted deadline sentence and re-parses the date itself', async () => {
    const r = emptyResultWith(`Applications close on 3 March 2027 at midnight. ${LONG}`)
    model({ applicationDeadlineText: 'Applications close on 3 March 2027' })
    await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    const found = r.deadlines.filter((d) => d.value.kind === 'APPLICATION_DEADLINE')
    expect(found).toHaveLength(1)
    expect(found[0]?.value.date.toISOString().slice(0, 10)).toBe('2027-03-03')
    expect(found[0]?.provenance.method).toBe('AI_EXTRACTED')
  })

  it('discards a deadline sentence that is not on the page', async () => {
    // The single most dangerous output the model can produce.
    const r = emptyResultWith(`This programme runs each summer. ${LONG}`)
    model({ applicationDeadlineText: 'Applications close on 1 January 2027' })
    const report = await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    expect(r.deadlines).toHaveLength(0)
    expect(report.filled).not.toContain('applicationDeadline')
    expect(report.rejected.join(' ')).toMatch(/1 January 2027/)
  })

  it('discards a quoted sentence with no parseable date in it', async () => {
    const r = emptyResultWith(`Applications close soon, so apply early. ${LONG}`)
    model({ applicationDeadlineText: 'Applications close soon' })
    const report = await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    expect(r.deadlines).toHaveLength(0)
    expect(report.filled).not.toContain('applicationDeadline')
    expect(report.rejected.join(' ')).toMatch(/unparseable/)
  })

  it('does not add a deadline when markup already found one', async () => {
    const r = emptyResultWith(`Applications close on 3 March 2027. ${LONG}`)
    r.deadlines = [{
      value: { kind: 'APPLICATION_DEADLINE', date: new Date('2027-06-30'), isRollingAdmission: false },
      provenance: { method: 'STRUCTURED_MARKUP', sourceUrl: 'u', confidence: 'HIGH', at: '' },
    }]
    model({ applicationDeadlineText: 'Applications close on 3 March 2027' })
    await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    expect(r.deadlines).toHaveLength(1)
    expect(r.deadlines[0]?.provenance.method).toBe('STRUCTURED_MARKUP')
  })
})

describe('fillGapsWithAi — cost, re-derived rather than trusted', () => {
  it('takes the wording from the model but the number from the parser', async () => {
    const r = emptyResultWith(`The registration fee is £450 per participant. ${LONG}`)
    model({ costText: 'The registration fee is £450' })
    await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    expect(r.costType?.value).toBe('PAID')
    expect(r.costAmount?.value).toBe(450)
  })

  it('does not record a cost from a phrase that states no fee', async () => {
    const r = emptyResultWith(`Winners receive a £2,000 prize for their work. ${LONG}`)
    model({ costText: 'Winners receive a £2,000 prize' })
    await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    // A prize is not a fee. The deterministic parser is what enforces that.
    expect(r.costAmount?.value).not.toBe(2000)
  })
})

describe('fillGapsWithAi — the report must not overstate', () => {
  // The report's counts go into the permanent audit note on the record
  // ("AI filled N field(s)"), so a field counted as filled but not stored
  // makes the audit trail wrong about what happened.

  it('does not count an age range it then threw away', async () => {
    const r = emptyResultWith(`Open to students aged 14 to 18 in any school. ${LONG}`)
    // Verbatim phrase, but the model gave no numbers, so nothing is stored.
    model({ ageRangeText: 'Open to students aged 14 to 18', ageMin: null, ageMax: null })
    const report = await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    expect(r.ageRange).toBeNull()
    expect(report.filled).not.toContain('ageRange')
  })

  it('does not count a cost it then threw away', async () => {
    const r = emptyResultWith(`Please contact the office about attending. ${LONG}`)
    model({ costText: 'contact the office about attending' })
    const report = await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    expect(r.costType).toBeNull()
    expect(report.filled).not.toContain('cost')
  })

  it('counts only what it actually stored', async () => {
    const r = emptyResultWith(`Summer Research Placement runs in July. ${LONG}`)
    model({ title: 'Summer Research Placement', summary: 'Not on the page at all' })
    const report = await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    expect(report.filled).toEqual(['title'])
    expect(report.rejected).toHaveLength(1)
  })
})

describe('fillGapsWithAi — requirements and benefits', () => {
  it('keeps only requirements quoted from the page', async () => {
    const r = emptyResultWith(`Applicants must submit two references and a transcript. ${LONG}`)
    model({ requirements: ['two references', 'a transcript', 'an interview with the dean'] })
    const report = await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    expect(r.requirements.map((x) => x.value.label)).toEqual(['two references', 'a transcript'])
    expect(report.rejected.join(' ')).toMatch(/interview with the dean/)
  })

  it('keeps only benefits the organiser actually stated', async () => {
    const r = emptyResultWith(`All participants receive a certificate of completion. ${LONG}`)
    model({ statedBenefits: ['a certificate of completion', 'a guaranteed university place'] })
    await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    expect(r.statedBenefits.map((x) => x.value.label)).toEqual(['a certificate of completion'])
  })
})

describe('fillGapsWithAi — when the model misbehaves entirely', () => {
  it('survives the provider returning null', async () => {
    const r = emptyResultWith(`Some page text goes here. ${LONG}`)
    callStructured.mockResolvedValueOnce(null)
    const report = await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    expect(report.attempted).toBe(true)
    expect(report.filled).toEqual([])
    expect(r.title).toBeNull()
  })

  it('stores nothing at all when every field is fabricated', async () => {
    const r = emptyResultWith(`An ordinary page with no opportunity on it. ${LONG}`)
    model({
      title: 'Invented Programme',
      summary: 'An invented summary',
      organizerName: 'Invented University',
      applicationDeadlineText: 'Applications close 1 May 2027',
      ageRangeText: 'aged 16 to 18',
      ageMin: 16,
      ageMax: 18,
      costText: 'a fee of £300',
      requirements: ['a personal statement'],
      statedBenefits: ['a scholarship'],
    })
    const report = await fillGapsWithAi(r, 'https://example.org/p', FETCHED)

    expect(report.filled).toEqual([])
    expect(r.title).toBeNull()
    expect(r.summary).toBeNull()
    expect(r.organizerName).toBeNull()
    expect(r.deadlines).toHaveLength(0)
    expect(r.ageRange).toBeNull()
    expect(r.costType).toBeNull()
    expect(r.requirements).toHaveLength(0)
    expect(r.statedBenefits).toHaveLength(0)
    expect(report.rejected.length).toBeGreaterThanOrEqual(7)
  })
})
