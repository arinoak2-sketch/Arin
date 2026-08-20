import { afterAll, describe, expect, it, vi } from 'vitest'

/**
 * The whole discovery pipeline, with only the search API substituted.
 *
 * Everything downstream of the search call is real: query planning, the
 * monthly budget reservation, hit ranking, the SSRF-guarded fetcher going out
 * over the network to a live third-party server, extraction, dedupe against
 * the corpus, persistence, provenance and the verification-state decision.
 *
 * Only braveProvider.search is stubbed, and only because a Brave key cannot be
 * obtained in this environment. It returns URLs that are genuinely reachable
 * here, so the fetch that follows is a real HTTP request to a real host — not
 * a fixture. What that leaves untested is exactly one thing: parsing Brave's
 * own JSON response. Everything a key unlocks beyond that is covered here.
 *
 * Opt-in via PROBE_LIVE=1, and it cleans up after itself.
 */

const search = vi.fn()

vi.mock('@/lib/discovery/brave', () => ({
  braveProvider: {
    isConfigured: () => true,
    search: (...args: unknown[]) => search(...args),
  },
}))

const { runDiscovery } = await import('@/lib/discovery/pipeline')
const { prisma } = await import('@/lib/db/client')

const enabled = process.env.PROBE_LIVE === '1'

/** Real, reachable pages. Not opportunities — that is the point of the test. */
const REAL_URLS = [
  { title: 'requests', url: 'https://pypi.org/project/requests/', snippet: 'Python HTTP for Humans.', domain: 'pypi.org' },
  { title: 'flask', url: 'https://pypi.org/project/Flask/', snippet: 'A simple framework.', domain: 'pypi.org' },
]

/** A complete filter set — every field is required by DiscoveryFilters. */
const FILTERS = {
  categories: [] as string[],
  subjects: ['molecular biology'],
  countryCode: 'GB',
  city: null,
  format: null,
  costFree: null,
  age: 16,
  educationLevel: null,
  withinDays: null,
  month: null,
  keywords: ['research'],
}

const createdSlugs: string[] = []

afterAll(async () => {
  if (createdSlugs.length > 0) {
    await prisma.opportunity.deleteMany({ where: { slug: { in: createdSlugs } } })
  }
  await prisma.discoveryQuery.deleteMany({ where: { rawQuery: { startsWith: 'PROBE ' } } })
  await prisma.$disconnect()
})

describe.skipIf(!enabled)('the full discovery pipeline', () => {
  it('plans, budgets, fetches over the real network, extracts and stores', async () => {
    search.mockResolvedValue(REAL_URLS)

    const outcome = await runDiscovery({
      rawQuery: 'PROBE summer research placement',
      filters: FILTERS,
      profile: null,
    })

    console.log(`\n  ok           : ${outcome.ok}`)
    console.log(`  queries run  : ${outcome.queriesRun.length}`)
    console.log(`  hits         : ${outcome.hitsConsidered}`)
    console.log(`  created      : ${outcome.created}`)
    console.log(`  merged       : ${outcome.merged}`)
    console.log(`  for review   : ${outcome.queuedForReview}`)
    console.log(`  skipped      : ${outcome.skipped.map((s) => s.reason).join(' | ') || 'none'}`)
    console.log(`  duration     : ${outcome.durationMs}ms`)

    expect(outcome.ok, outcome.unavailableReason ?? '').toBe(true)
    // Query planning turned a phrase into real queries.
    expect(outcome.queriesRun.length).toBeGreaterThan(0)
    expect(outcome.hitsConsidered).toBeGreaterThan(0)

    // The run was logged for the monthly budget to count against.
    const logged = await prisma.discoveryQuery.findFirst({
      where: { rawQuery: 'PROBE summer research placement' },
    })
    expect(logged, 'the run was not recorded against the budget').not.toBeNull()
    expect(logged?.provider).toBe('brave')

    const stored = await prisma.opportunity.findMany({
      where: { sources: { some: { domain: 'pypi.org' } } },
      include: { deadlines: true, sources: true, eligibility: true, verifications: true },
    })
    createdSlugs.push(...stored.map((s) => s.slug))
    console.log(`  stored       : ${stored.length}`)

    for (const record of stored) {
      console.log(`\n  → ${record.title}`)
      console.log(`    state      : ${record.verificationState}`)
      console.log(`    via        : ${record.sources.map((s) => s.discoveredVia).join(',')}`)
      console.log(`    deadlines  : ${record.deadlines.length}`)
      console.log(`    audit      : ${record.verifications.map((v) => v.note).join(' | ')}`)

      // A source found by search is recorded as such, not as an admin entry.
      expect(record.sources.every((s) => s.discoveredVia === 'BRAVE')).toBe(true)

      // The load-bearing guarantee. These pages are not opportunities, so no
      // amount of pipeline machinery may give them opportunity facts.
      expect(record.deadlines, `${record.title} invented a deadline`).toHaveLength(0)
      expect(record.eligibility, `${record.title} invented eligibility`).toHaveLength(0)
      expect(record.costAmount, `${record.title} invented a cost`).toBeNull()

      // Nothing automated reaches VERIFIED. Only a person can do that.
      expect(record.verificationState).not.toBe('VERIFIED')
    }
  }, 120_000)

  it('does not create a second listing when the same page comes back again', async () => {
    search.mockResolvedValue(REAL_URLS)

    const before = await prisma.opportunity.count({ where: { sources: { some: { domain: 'pypi.org' } } } })
    const outcome = await runDiscovery({
      rawQuery: 'PROBE summer research placement again',
      filters: FILTERS,
      profile: null,
    })
    const after = await prisma.opportunity.count({ where: { sources: { some: { domain: 'pypi.org' } } } })

    console.log(`\n  second run → created=${outcome.created} merged=${outcome.merged}`)
    expect(after, 'a duplicate listing was created').toBe(before)
    expect(outcome.created).toBe(0)
  }, 120_000)
})
