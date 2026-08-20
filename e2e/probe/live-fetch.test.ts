import { describe, expect, it } from 'vitest'
import { fetchPage } from '@/lib/discovery/fetcher'
import { extractFromHtml } from '@/lib/discovery/extract/structured'

/**
 * Proves the fetch-and-extract path works against a real server.
 *
 * Everything else that tests the extractor feeds it HTML written to test it.
 * This reaches a third party over the network: DNS, the SSRF guard resolving a
 * real address, robots.txt, redirects, compression, a real content type, and
 * whatever markup someone else decided to publish.
 *
 * pypi.org is the target because it is a real site with ordinary
 * OpenGraph markup that happens to be reachable from restricted build
 * environments. It is not an opportunity, and nothing here is stored — the
 * question is only whether the machinery survives contact with the real web.
 *
 * Skipped unless PROBE_LIVE=1, so an ordinary test run never depends on a
 * third party being up.
 */

const enabled = process.env.PROBE_LIVE === '1'

describe.skipIf(!enabled)('fetching a real page', () => {
  it('fetches, respects robots, and extracts what is actually published', async () => {
    const fetched = await fetchPage('https://pypi.org/project/requests/')

    console.log(`\n  ok=${fetched.ok} status=${fetched.status ?? '—'} error=${fetched.error ?? '—'}`)
    expect(fetched.ok, fetched.error ?? 'fetch failed').toBe(true)
    expect(fetched.html, 'no body returned').toBeTruthy()
    expect(fetched.contentHash, 'no content hash').toBeTruthy()

    const extraction = extractFromHtml(fetched.html!, fetched.finalUrl ?? '', fetched.fetchedAt)

    console.log(`  title      : ${extraction.title?.value ?? '— none'}`)
    console.log(`  via        : ${extraction.title?.provenance.method ?? '—'}`)
    console.log(`  summary    : ${(extraction.summary?.value ?? '— none').slice(0, 90)}`)
    console.log(`  text length: ${extraction.text.length}`)
    console.log(`  gaps       : ${extraction.gaps.join(', ')}`)
    console.log(`  deadlines  : ${extraction.deadlines.length}`)

    // A title is the one thing nearly every real page has.
    expect(extraction.title?.value).toBeTruthy()
    expect(extraction.text.length).toBeGreaterThan(200)

    // The point of the trust rules: a page that is not an opportunity must not
    // acquire opportunity facts. No fee, no deadline, invented from prose.
    expect(extraction.gaps).toContain('applicationDeadline')
    expect(extraction.deadlines.filter((d) => d.value.kind === 'APPLICATION_DEADLINE')).toHaveLength(0)
    expect(extraction.costAmount).toBeNull()
  }, 60_000)
})
