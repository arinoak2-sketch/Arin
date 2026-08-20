import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Brave Search adapter.
 *
 * Two things are being tested, and they are worth separating honestly.
 *
 * The response *shape* is Brave's, and asserting it here only proves the
 * parser matches what this codebase believes that shape to be — the belief
 * itself is confirmed the first time a real key is used. What IS certain, and
 * what these tests are really for, is the failure handling: HTTP status codes
 * are not Brave's invention, and every one of them must become a typed error
 * the UI can explain. A search that fails must never look like "there are no
 * opportunities for you", which is the single most discouraging thing this
 * product could say to a student.
 */

const braveApiKey = vi.fn<() => string | null>(() => 'test-key')

vi.mock('@/lib/config', () => ({ braveApiKey: () => braveApiKey() }))

const { BraveSearchProvider } = await import('./brave')
const { SearchUnavailableError } = await import('./provider')

const provider = new BraveSearchProvider()

const respondWith = (status: number, body: unknown, headers: Record<string, string> = {}) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers })),
  )
}

const query = { q: 'summer research programme', count: 10 }

beforeEach(() => {
  braveApiKey.mockReturnValue('test-key')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('configuration', () => {
  it('reports itself unconfigured without a key', () => {
    braveApiKey.mockReturnValue(null)
    expect(provider.isConfigured()).toBe(false)
  })

  it('refuses to call out at all without a key', async () => {
    braveApiKey.mockReturnValue(null)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(provider.search(query)).rejects.toThrow(SearchUnavailableError)
    expect(fetchSpy, 'a request was made without a key').not.toHaveBeenCalled()
  })
})

describe('the request it builds', () => {
  it('sends the key as a subscription token, never in the URL', async () => {
    respondWith(200, { web: { results: [] } })
    await provider.search({ ...query, country: 'gb', language: 'en' })

    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    // A key in a query string ends up in logs, referrers and browser history.
    expect(url).not.toContain('test-key')
    expect((init.headers as Record<string, string>)['X-Subscription-Token']).toBe('test-key')
  })

  it('asks for moderate safe search, because the audience starts at 13', async () => {
    respondWith(200, { web: { results: [] } })
    await provider.search(query)

    const [url] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('safesearch=moderate')
  })

  it('caps count at the provider maximum rather than sending an invalid value', async () => {
    respondWith(200, { web: { results: [] } })
    await provider.search({ ...query, count: 500 })

    const [url] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('count=20')
  })

  it('upper-cases the country code', async () => {
    respondWith(200, { web: { results: [] } })
    await provider.search({ ...query, country: 'gb' })

    const [url] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('country=GB')
  })
})

describe('reading results', () => {
  it('maps results to hits and derives the domain', async () => {
    respondWith(200, {
      web: {
        results: [
          { title: 'Summer Research', url: 'https://www.example.edu/summer', description: 'Six weeks.' },
        ],
      },
    })

    const hits = await provider.search(query)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.title).toBe('Summer Research')
    expect(hits[0]?.domain).toBe('example.edu')
  })

  it('decodes HTML entities in titles', async () => {
    respondWith(200, {
      web: { results: [{ title: 'Maths &amp; Physics &#39;26', url: 'https://example.edu/x', description: '' }] },
    })

    const hits = await provider.search(query)
    expect(hits[0]?.title).toBe("Maths & Physics '26")
  })

  it('drops results missing a url or title rather than storing a blank', async () => {
    respondWith(200, {
      web: {
        results: [
          { title: 'No url here', description: '' },
          { url: 'https://example.edu/no-title', description: '' },
          { title: 'Fine', url: 'https://example.edu/fine', description: '' },
        ],
      },
    })

    const hits = await provider.search(query)
    expect(hits.map((h) => h.title)).toEqual(['Fine'])
  })

  it('returns nothing, and does not throw, when the body has no results', async () => {
    respondWith(200, {})
    await expect(provider.search(query)).resolves.toEqual([])
  })
})

describe('failure is always typed and explainable', () => {
  // This is the part that does not depend on guessing Brave's response shape.
  const cases: Array<[number, string, string]> = [
    [401, 'NOT_CONFIGURED', 'key was rejected'],
    [403, 'NOT_CONFIGURED', 'key was rejected'],
    [422, 'QUOTA_EXHAUSTED', 'quota'],
    [429, 'RATE_LIMITED', 'rate-limiting'],
    [500, 'PROVIDER_ERROR', '500'],
    [503, 'PROVIDER_ERROR', '503'],
  ]

  for (const [status, kind, wording] of cases) {
    it(`turns ${status} into ${kind}`, async () => {
      respondWith(status, {})
      await expect(provider.search(query)).rejects.toMatchObject({ kind })
      await expect(provider.search(query)).rejects.toThrow(new RegExp(wording, 'i'))
    })
  }

  it('reads retry-after when it is rate-limited', async () => {
    respondWith(429, {}, { 'retry-after': '30' })
    await expect(provider.search(query)).rejects.toMatchObject({ retryAfterMs: 30_000 })
  })

  it('falls back to a sane retry delay when the header is missing or junk', async () => {
    respondWith(429, {}, { 'retry-after': 'soon' })
    await expect(provider.search(query)).rejects.toMatchObject({ retryAfterMs: 60_000 })
  })

  it('turns an unreachable provider into a typed error, not a raw network throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    await expect(provider.search(query)).rejects.toThrow(SearchUnavailableError)
    await expect(provider.search(query)).rejects.toMatchObject({ kind: 'PROVIDER_ERROR' })
  })

  it('reports a timeout as a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    }))
    await expect(provider.search(query)).rejects.toThrow(/did not respond in time/i)
  })

  it('never leaks the key in an error message', async () => {
    respondWith(401, {})
    await expect(provider.search(query)).rejects.toSatisfy(
      (e: Error) => !e.message.includes('test-key'),
    )
  })
})
