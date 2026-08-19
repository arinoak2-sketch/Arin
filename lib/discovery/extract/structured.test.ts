import { describe, expect, it } from 'vitest'
import { extractFromHtml } from './structured'

/**
 * Tests for the highest-trust extraction tier.
 *
 * Anything this file produces is stamped STRUCTURED_MARKUP, which carries HIGH
 * confidence and is shown to students as "published in the page's own
 * structured data by the organiser". A wrong value here is worse than no value:
 * it is a false statement made with Lumen's full authority behind it. So these
 * tests care as much about what is *refused* as about what is extracted.
 */

const FETCHED = new Date('2026-03-01T00:00:00Z')

/** Wraps JSON-LD in the minimum page that cheerio will parse. */
const page = (jsonLd: unknown, body = '<p>Body text.</p>') =>
  `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body>${body}</body></html>`

const extract = (html: string) => extractFromHtml(html, 'https://example.org/programme', FETCHED)

const deadlineOfKind = (r: ReturnType<typeof extract>, kind: string) =>
  r.deadlines.filter((d) => d.value.kind === kind)

describe('extractFromHtml — JSON-LD basics', () => {
  it('reads name, description and organiser from a relevant type', () => {
    const r = extract(
      page({
        '@type': 'EducationalOccupationalProgram',
        name: 'Summer Research Programme',
        description: 'Six weeks in a working lab.',
        provider: { '@type': 'Organization', name: 'Example University' },
      }),
    )

    expect(r.title?.value).toBe('Summer Research Programme')
    expect(r.summary?.value).toBe('Six weeks in a working lab.')
    expect(r.organizerName?.value).toBe('Example University')
    expect(r.title?.provenance.method).toBe('STRUCTURED_MARKUP')
    expect(r.title?.provenance.confidence).toBe('HIGH')
  })

  it('keeps the organiser name verbatim as rawText', () => {
    const r = extract(page({ '@type': 'Course', provider: { name: 'Example University' } }))
    expect(r.organizerName?.provenance.rawText).toBe('Example University')
  })

  it('ignores schema.org types that are not opportunities', () => {
    const r = extract(page({ '@type': 'BreadcrumbList', name: 'Navigation' }))
    expect(r.title?.value).not.toBe('Navigation')
  })

  it('walks @graph containers', () => {
    const r = extract(page({ '@graph': [{ '@type': 'Course', name: 'Graph Course' }] }))
    expect(r.title?.value).toBe('Graph Course')
  })

  it('survives malformed JSON-LD without throwing', () => {
    const html = `<!doctype html><html><head><script type="application/ld+json">{ not json</script></head><body><p>Text</p></body></html>`
    expect(() => extract(html)).not.toThrow()
  })
})

describe('extractFromHtml — deadlines', () => {
  it('reads an application deadline published as such', () => {
    const r = extract(page({ '@type': 'Course', applicationDeadline: '2026-06-30' }))
    const found = deadlineOfKind(r, 'APPLICATION_DEADLINE')
    expect(found).toHaveLength(1)
    expect(found[0]?.value.date.toISOString().slice(0, 10)).toBe('2026-06-30')
  })

  it('never reports applicationStartDate as a deadline', () => {
    // schema.org applicationStartDate is when applications OPEN. Presenting it
    // as a closing date would tell a student to hurry for a date months early,
    // or mark an open programme as closed.
    const r = extract(page({ '@type': 'Course', applicationStartDate: '2026-01-15' }))
    expect(deadlineOfKind(r, 'APPLICATION_DEADLINE')).toHaveLength(0)
  })

  it('reads programme start and end separately from the deadline', () => {
    const r = extract(page({ '@type': 'Course', startDate: '2026-07-06', endDate: '2026-08-14' }))
    expect(deadlineOfKind(r, 'PROGRAM_START')).toHaveLength(1)
    expect(deadlineOfKind(r, 'PROGRAM_END')).toHaveLength(1)
  })

  it('still scans the page text for a deadline when markup gave only programme dates', () => {
    // A start date in markup must not suppress the search for the thing the
    // student actually needs: when applications close.
    const r = extract(
      page(
        { '@type': 'Course', startDate: '2026-07-06' },
        '<p>Applications close on 3 March 2027.</p>',
      ),
    )
    expect(deadlineOfKind(r, 'PROGRAM_START')).toHaveLength(1)
    expect(deadlineOfKind(r, 'APPLICATION_DEADLINE').length).toBeGreaterThan(0)
  })

  it('does not let markup deadlines be overwritten by page text', () => {
    const r = extract(
      page(
        { '@type': 'Course', applicationDeadline: '2026-06-30' },
        '<p>Applications close on 3 March 2027.</p>',
      ),
    )
    const found = deadlineOfKind(r, 'APPLICATION_DEADLINE')
    expect(found).toHaveLength(1)
    expect(found[0]?.provenance.method).toBe('STRUCTURED_MARKUP')
  })

  it('does not emit the same date twice when a page repeats a node', () => {
    const r = extract(
      page([
        { '@type': 'Course', name: 'A', startDate: '2026-07-06' },
        { '@type': 'CourseInstance', startDate: '2026-07-06' },
      ]),
    )
    expect(deadlineOfKind(r, 'PROGRAM_START')).toHaveLength(1)
  })

  it('ignores unparseable date strings rather than guessing', () => {
    const r = extract(page({ '@type': 'Course', applicationDeadline: 'rolling' }))
    expect(deadlineOfKind(r, 'APPLICATION_DEADLINE')).toHaveLength(0)
  })
})

describe('extractFromHtml — cost', () => {
  it('reads a priced offer', () => {
    const r = extract(page({ '@type': 'Course', offers: { price: 450, priceCurrency: 'GBP' } }))
    expect(r.costType?.value).toBe('PAID')
    expect(r.costAmount?.value).toBe(450)
    expect(r.costCurrency?.value).toBe('GBP')
  })

  it('reads a zero-price offer as free', () => {
    const r = extract(page({ '@type': 'Course', offers: { price: 0, priceCurrency: 'GBP' } }))
    expect(r.costType?.value).toBe('FREE')
    expect(r.costAmount).toBeNull()
  })

  it('reads a numeric price given as a string', () => {
    const r = extract(page({ '@type': 'Course', offers: { price: '450.00', priceCurrency: 'USD' } }))
    expect(r.costAmount?.value).toBe(450)
  })

  it('does not read a non-numeric price as free', () => {
    // "Number('') === 0" is the trap: stripping the letters out of "contact us"
    // leaves an empty string, which coerces to zero and would publish a
    // fabricated "Free" with HIGH confidence.
    for (const price of ['contact us', 'TBD', 'varies', 'on application']) {
      const r = extract(page({ '@type': 'Course', offers: { price, priceCurrency: 'GBP' } }))
      expect(r.costType?.value, `price: ${price}`).not.toBe('FREE')
    }
  })

  it('leaves cost null when an offer carries no price at all', () => {
    const r = extract(page({ '@type': 'Course', offers: { priceCurrency: 'GBP' } }))
    expect(r.costType).toBeNull()
  })
})

describe('extractFromHtml — format', () => {
  it('reads schema.org attendance-mode URLs', () => {
    const cases: Array<[string, string]> = [
      ['https://schema.org/OnlineEventAttendanceMode', 'ONLINE'],
      ['https://schema.org/OfflineEventAttendanceMode', 'IN_PERSON'],
      ['https://schema.org/MixedEventAttendanceMode', 'HYBRID'],
    ]
    for (const [mode, expected] of cases) {
      const r = extract(page({ '@type': 'Event', eventAttendanceMode: mode }))
      expect(r.format?.value, mode).toBe(expected)
    }
  })

  it('does not guess in-person from an unrecognised mode', () => {
    // Format carries real weight in matching and decides whether travel is
    // implied. An unrecognised string is not evidence of anything.
    const r = extract(page({ '@type': 'Course', courseMode: 'self-paced' }))
    expect(r.format?.value).not.toBe('IN_PERSON')
  })

  it('falls through to page text when markup has no usable mode', () => {
    const r = extract(
      page({ '@type': 'Course', courseMode: 'self-paced' }, '<p>This programme is fully online.</p>'),
    )
    expect(r.format?.value).toBe('ONLINE')
    expect(r.format?.provenance.method).toBe('LABELLED_PAGE_TEXT')
  })
})

describe('extractFromHtml — provenance honesty', () => {
  it('does not label the HTML title tag as structured markup', () => {
    // METHOD_EXPLANATION renders STRUCTURED_MARKUP as "published in the page's
    // own structured data by the organiser". A <title> is neither.
    const html = `<!doctype html><html><head><title>Programme | Example University</title></head><body><p>Text</p></body></html>`
    const r = extract(html)
    expect(r.title?.value).toBe('Programme | Example University')
    expect(r.title?.provenance.method).not.toBe('STRUCTURED_MARKUP')
  })

  it('does label OpenGraph tags as structured markup', () => {
    const html = `<!doctype html><html><head><meta property="og:title" content="Summer Programme"></head><body><p>Text</p></body></html>`
    const r = extract(html)
    expect(r.title?.value).toBe('Summer Programme')
    expect(r.title?.provenance.method).toBe('STRUCTURED_MARKUP')
  })

  it('records the source url on every field it produces', () => {
    const r = extract(page({ '@type': 'Course', name: 'X', description: 'Y' }))
    expect(r.title?.provenance.sourceUrl).toBe('https://example.org/programme')
    expect(r.summary?.provenance.sourceUrl).toBe('https://example.org/programme')
  })
})

describe('extractFromHtml — gaps', () => {
  it('reports every unfilled field so the AI stage knows its bounds', () => {
    const r = extract(`<!doctype html><html><body><p>Nothing useful here.</p></body></html>`)
    expect(r.gaps).toContain('organizerName')
    expect(r.gaps).toContain('applicationDeadline')
    expect(r.gaps).toContain('costType')
  })

  it('does not report a field the markup filled', () => {
    const r = extract(page({ '@type': 'Course', name: 'X', applicationDeadline: '2026-06-30' }))
    expect(r.gaps).not.toContain('title')
    expect(r.gaps).not.toContain('applicationDeadline')
  })

  it('counts a programme start date as leaving the deadline still missing', () => {
    const r = extract(page({ '@type': 'Course', startDate: '2026-07-06' }))
    expect(r.gaps).toContain('applicationDeadline')
  })
})
