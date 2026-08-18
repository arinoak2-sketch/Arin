import { describe, expect, it } from 'vitest'
import { compare, detectCycleYear, findDuplicate, normaliseTitle, trigramSimilarity } from './dedupe'
import { canonicaliseUrl, parseRobots, robotsAllows } from './fetcher'
import { describeFilters, parseNaturalQuery, planQueries } from './queryPlanner'
import { isOfficialDomain, rankHits, sourceTier, type SearchHit } from './provider'
import { makeProvenance, mergeProvenance, outranks, requiresHumanConfirmation } from './provenance'

describe('duplicate detection', () => {
  const base = { canonicalUrl: 'https://a.edu/p', title: 'Summer Research Programme', organizationDomain: 'a.edu' }

  it('merges an identical canonical URL', () => {
    expect(compare(base, { ...base }).verdict).toBe('SAME')
  })

  it('merges byte-identical content served from two URLs', () => {
    const a = { ...base, canonicalUrl: 'https://a.edu/p', contentHash: 'abc' }
    const b = { ...base, canonicalUrl: 'https://a.edu/programme', contentHash: 'abc' }
    expect(compare(a, b).verdict).toBe('SAME')
  })

  it('merges a near-identical title from the same organiser', () => {
    const r = compare(base, {
      canonicalUrl: 'https://a.edu/summer-research',
      title: 'Summer Research Program',
      organizationDomain: 'a.edu',
    })
    expect(r.verdict).toBe('SAME')
  })

  it('sends a same-title-different-organiser pair to review rather than merging', () => {
    // Two universities can genuinely run programmes with the same name.
    const r = compare(base, {
      canonicalUrl: 'https://b.edu/p',
      title: 'Summer Research Programme',
      organizationDomain: 'b.edu',
    })
    expect(r.verdict).toBe('REVIEW')
  })

  it('never merges two cycles of the same recurring opportunity', () => {
    const r = compare(
      { ...base, cycleYear: 2026 },
      { ...base, canonicalUrl: 'https://a.edu/p-2027', cycleYear: 2027 },
    )
    expect(r.verdict).toBe('DIFFERENT')
    expect(r.reason).toContain('cycles')
  })

  it('keeps genuinely different opportunities apart', () => {
    expect(
      compare(base, {
        canonicalUrl: 'https://a.edu/debate',
        title: 'National Debate Championship',
        organizationDomain: 'a.edu',
      }).verdict,
    ).toBe('DIFFERENT')
  })

  it('strips the year from a title so it does not dominate similarity', () => {
    expect(normaliseTitle('Summer Research Programme 2026')).toBe('summer research programme')
  })

  it('scores similar titles highly and different ones low', () => {
    expect(trigramSimilarity('Summer Research Programme', 'Summer Research Program')).toBeGreaterThan(0.85)
    expect(trigramSimilarity('Summer Research Programme', 'Junior Chess Championship')).toBeLessThan(0.3)
  })

  it('finds the best match in a corpus', () => {
    const match = findDuplicate(base, [
      { canonicalUrl: 'https://x.edu/1', title: 'Chess Open', organizationDomain: 'x.edu' },
      { canonicalUrl: 'https://a.edu/2', title: 'Summer Research Program', organizationDomain: 'a.edu' },
    ])
    expect(match!.result.verdict).toBe('SAME')
  })

  it('will not assume a cycle year that is not stated', () => {
    expect(detectCycleYear('Summer Research Programme', 'https://a.edu/p')).toBeNull()
    expect(detectCycleYear('Summer Research Programme 2027', 'https://a.edu/p')).toBe(2027)
  })
})

describe('robots.txt', () => {
  const body = `
User-agent: *
Disallow: /private
Allow: /private/public
Crawl-delay: 2

User-agent: BadBot
Disallow: /
`

  it('honours a disallow', () => {
    const rules = parseRobots(body)
    expect(robotsAllows(rules, '/private/thing')).toBe(false)
    expect(robotsAllows(rules, '/programmes/summer')).toBe(true)
  })

  it('lets a longer allow override a shorter disallow', () => {
    expect(robotsAllows(parseRobots(body), '/private/public/page')).toBe(true)
  })

  it('reads a crawl delay and caps it', () => {
    expect(parseRobots(body).crawlDelayMs).toBe(2000)
    expect(parseRobots('User-agent: *\nCrawl-delay: 600').crawlDelayMs).toBe(10_000)
  })

  it('prefers a group that names us specifically', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: lumenbot\nDisallow: /admin')
    expect(robotsAllows(rules, '/programmes')).toBe(true)
    expect(robotsAllows(rules, '/admin/x')).toBe(false)
  })
})

describe('URL canonicalisation', () => {
  it('strips tracking parameters and fragments so links dedupe', () => {
    expect(canonicaliseUrl('https://www.a.edu/p/?utm_source=x&id=3#top')).toBe('https://a.edu/p?id=3')
  })

  it('leaves a clean URL alone apart from the www prefix', () => {
    expect(canonicaliseUrl('https://a.edu/programme')).toBe('https://a.edu/programme')
  })
})

describe('natural-language search', () => {
  it('parses the example from the brief', () => {
    const f = parseNaturalQuery('Free STEM programmes for 16-year-olds in India')
    expect(f.categories).toContain('stem')
    expect(f.costFree).toBe(true)
    expect(f.age).toBe(16)
    expect(f.countryCode).toBe('IN')
  })

  it('parses a location and month query', () => {
    const f = parseNaturalQuery('MUNs in Mumbai during September')
    expect(f.categories).toContain('mun')
    expect(f.month).toBe(9)
  })

  it('parses a level and subject query', () => {
    const f = parseNaturalQuery('Research opportunities for high-school students interested in medicine')
    expect(f.categories).toContain('research')
    expect(f.subjects).toContain('medicine')
    expect(f.educationLevel).toBe('SENIOR_SECONDARY')
  })

  it('parses the European medicine example', () => {
    const f = parseNaturalQuery('Find me free summer programs in Europe for students interested in medicine')
    expect(f.categories).toContain('summer-program')
    expect(f.subjects).toContain('medicine')
    expect(f.costFree).toBe(true)
  })

  it('keeps unrecognised words as keywords rather than dropping them', () => {
    const f = parseNaturalQuery('scholarships for aeronautics enthusiasts')
    expect(f.keywords).toContain('aeronautics')
  })

  it('produces chips a student can read back and correct', () => {
    const chips = describeFilters(parseNaturalQuery('Free online debate competitions in the UK'))
    const values = chips.map((c) => c.value)
    expect(values).toContain('Free only')
    expect(values).toContain('GB')
    expect(chips.every((c) => c.label.length > 0)).toBe(true)
  })

  it('returns empty filters for empty input rather than throwing', () => {
    expect(parseNaturalQuery('  ').categories).toEqual([])
  })
})

describe('query planning', () => {
  it('builds several targeted queries instead of one vague one', () => {
    const queries = planQueries(parseNaturalQuery('research programmes'), {
      age: 16, countryCode: 'GB', educationLevel: 'SENIOR_SECONDARY',
      interests: ['molecular-biology', 'chemistry'], careerDirections: ['medicine'], formatPreference: 'ANY',
    })
    expect(queries.length).toBeGreaterThan(1)
    expect(queries[0]).toContain('molecular biology')
    expect(queries[0]).toContain('high school students')
    expect(queries[0]).toContain(String(new Date().getUTCFullYear()))
  })

  it('does not bolt a country onto an explicitly online search', () => {
    const queries = planQueries(parseNaturalQuery('online free courses'), {
      age: 16, countryCode: 'GB', educationLevel: 'SENIOR_SECONDARY',
      interests: ['computer-science'], careerDirections: [], formatPreference: 'ONLINE',
    })
    expect(queries[0]).not.toContain('GB')
    expect(queries[0]).toContain('online')
  })

  it('still plans something useful with no profile at all', () => {
    expect(planQueries(parseNaturalQuery('scholarships'), null).length).toBeGreaterThan(0)
  })
})

describe('source quality', () => {
  it('recognises official domains', () => {
    expect(isOfficialDomain('ox.ac.uk')).toBe(true)
    expect(isOfficialDomain('mit.edu')).toBe(true)
    expect(isOfficialDomain('nasa.gov')).toBe(true)
    expect(isOfficialDomain('randomblog.com')).toBe(false)
  })

  it('ranks official above ordinary above aggregator', () => {
    expect(sourceTier('mit.edu')).toBe(3)
    expect(sourceTier('someorg.com')).toBe(2)
    expect(sourceTier('opportunitydesk.org')).toBe(1)
  })

  it('orders results by tier while preserving provider order within a tier', () => {
    const hits: SearchHit[] = [
      { title: 'A', url: 'https://opportunitydesk.org/a', snippet: '', domain: 'opportunitydesk.org' },
      { title: 'B', url: 'https://x.com/b', snippet: '', domain: 'x.com' },
      { title: 'C', url: 'https://mit.edu/c', snippet: '', domain: 'mit.edu' },
    ]
    expect(rankHits(hits).map((h) => h.title)).toEqual(['C', 'B', 'A'])
  })
})

describe('provenance', () => {
  it('ranks structured markup above AI extraction', () => {
    expect(outranks('STRUCTURED_MARKUP', 'AI_EXTRACTED')).toBe(true)
    expect(outranks('ADMIN_CORRECTED', 'STRUCTURED_MARKUP')).toBe(true)
    expect(outranks('SEARCH_RESULT', 'LABELLED_PAGE_TEXT')).toBe(false)
  })

  it('holds an AI-extracted deadline for human confirmation', () => {
    expect(requiresHumanConfirmation('applicationDeadline', 'AI_EXTRACTED')).toBe(true)
    expect(requiresHumanConfirmation('applicationDeadline', 'STRUCTURED_MARKUP')).toBe(false)
    // A summary is not a field a student can be harmed by.
    expect(requiresHumanConfirmation('summary', 'AI_EXTRACTED')).toBe(false)
  })

  it('reports a disagreement instead of silently picking a winner', () => {
    const a = { deadline: makeProvenance('LABELLED_PAGE_TEXT', 'https://a.edu', 'closes 1 Sep') }
    const b = { deadline: makeProvenance('STRUCTURED_MARKUP', 'https://b.org', 'closes 12 Sep') }
    const { conflicts } = mergeProvenance(a, b, () => false)
    expect(conflicts).toEqual(['deadline'])
  })

  it('treats agreement from a second source as re-confirmation', () => {
    const a = { deadline: makeProvenance('LABELLED_PAGE_TEXT', 'https://a.edu', 'closes 1 Sep') }
    const b = { deadline: makeProvenance('STRUCTURED_MARKUP', 'https://b.org', 'closes 1 Sep') }
    const { merged, conflicts } = mergeProvenance(a, b, () => true)
    expect(conflicts).toHaveLength(0)
    expect(merged.deadline!.method).toBe('STRUCTURED_MARKUP')
  })

  it('assigns confidence from the method, not from the caller', () => {
    expect(makeProvenance('STRUCTURED_MARKUP', 'https://a.edu').confidence).toBe('HIGH')
    expect(makeProvenance('AI_EXTRACTED', 'https://a.edu').confidence).toBe('MEDIUM')
    expect(makeProvenance('SEARCH_RESULT', 'https://a.edu').confidence).toBe('LOW')
  })
})
