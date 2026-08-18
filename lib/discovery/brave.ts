import 'server-only'
import { braveApiKey } from '@/lib/config'
import {
  domainOf,
  SearchUnavailableError,
  type SearchHit,
  type SearchProvider,
  type SearchQuery,
} from './provider'

const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'

interface BraveResult {
  title?: string
  url?: string
  description?: string
  age?: string
  page_age?: string
}

interface BraveResponse {
  web?: { results?: BraveResult[] }
}

/**
 * Brave Search adapter.
 *
 * Server-only: the key is billed per call, so it must never reach a browser.
 * Every failure mode is a typed SearchUnavailableError, because the UI's job on
 * failure is to say what happened — not to show an empty list that reads like
 * "no opportunities exist for you".
 */
export class BraveSearchProvider implements SearchProvider {
  readonly name = 'brave'

  isConfigured(): boolean {
    return braveApiKey() !== null
  }

  async search(query: SearchQuery): Promise<SearchHit[]> {
    const key = braveApiKey()
    if (!key) {
      throw new SearchUnavailableError('BRAVE_SEARCH_API_KEY is not set.', 'NOT_CONFIGURED')
    }

    const params = new URLSearchParams({
      q: query.q,
      count: String(Math.min(query.count ?? 20, 20)),
      safesearch: 'moderate', // the audience starts at 13
      text_decorations: 'false',
      spellcheck: 'true',
    })
    if (query.country) params.set('country', query.country.toUpperCase())
    if (query.language) params.set('search_lang', query.language)
    if (query.freshness) params.set('freshness', FRESHNESS[query.freshness])

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    let response: Response
    try {
      response = await fetch(`${ENDPOINT}?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': key,
        },
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch (cause) {
      const aborted = cause instanceof Error && cause.name === 'AbortError'
      throw new SearchUnavailableError(
        aborted ? 'The search provider did not respond in time.' : 'Could not reach the search provider.',
        'PROVIDER_ERROR',
      )
    } finally {
      clearTimeout(timeout)
    }

    if (response.status === 429) {
      const retry = Number.parseInt(response.headers.get('retry-after') ?? '', 10)
      throw new SearchUnavailableError(
        'The search provider is rate-limiting requests.',
        'RATE_LIMITED',
        Number.isFinite(retry) ? retry * 1000 : 60_000,
      )
    }
    if (response.status === 401 || response.status === 403) {
      throw new SearchUnavailableError('The search API key was rejected.', 'NOT_CONFIGURED')
    }
    if (response.status === 422) {
      // Brave returns 422 for a monthly quota overrun on the free plan.
      throw new SearchUnavailableError('The monthly search quota has been used up.', 'QUOTA_EXHAUSTED')
    }
    if (!response.ok) {
      throw new SearchUnavailableError(`The search provider returned ${response.status}.`, 'PROVIDER_ERROR')
    }

    const body = (await response.json()) as BraveResponse
    const results = body.web?.results ?? []

    return results.flatMap((r): SearchHit[] => {
      if (!r.url || !r.title) return []
      const domain = domainOf(r.url)
      if (!domain) return []
      return [
        {
          title: decodeEntities(r.title),
          url: r.url,
          snippet: decodeEntities(r.description ?? ''),
          // Only when the provider actually reports it — never guessed from the URL.
          publishedAt: parsePageAge(r.page_age),
          domain,
        },
      ]
    })
  }
}

const FRESHNESS: Record<NonNullable<SearchQuery['freshness']> & string, string> = {
  'past-week': 'pw',
  'past-month': 'pm',
  'past-year': 'py',
}

function parsePageAge(raw: string | undefined): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Brave returns HTML entities and <strong> highlighting in titles and snippets. */
function decodeEntities(s: string): string {
  return s
    .replace(/<\/?strong>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

export const braveProvider = new BraveSearchProvider()
