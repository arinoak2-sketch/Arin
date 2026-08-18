/**
 * The search-provider seam.
 *
 * Brave is the only adapter Lumen ships (docs D4). The interface exists so the
 * pipeline never holds a provider-specific assumption — not because a fleet of
 * providers is planned.
 */

export interface SearchQuery {
  q: string
  count?: number
  /** ISO 3166-1 alpha-2, when the student's search is location-bound. */
  country?: string
  /** ISO 639-1. */
  language?: string
  /** Restrict to recently-updated pages, where the provider supports it. */
  freshness?: 'past-week' | 'past-month' | 'past-year' | null
}

export interface SearchHit {
  title: string
  url: string
  snippet: string
  /** Only when the provider reports it. Never inferred from the URL. */
  publishedAt?: Date | null
  domain: string
}

export class SearchUnavailableError extends Error {
  constructor(
    message: string,
    readonly kind: 'NOT_CONFIGURED' | 'QUOTA_EXHAUSTED' | 'RATE_LIMITED' | 'PROVIDER_ERROR',
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'SearchUnavailableError'
  }
}

export interface SearchProvider {
  readonly name: string
  isConfigured(): boolean
  search(query: SearchQuery): Promise<SearchHit[]>
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Source quality tiers.
 *
 * Ranking is a transparent, auditable list — never a hidden model. An official
 * university or government page is a better source for a deadline than an
 * aggregator that copied it, and a student deserves to know which they're
 * looking at.
 */
export const OFFICIAL_TLD_PATTERNS: RegExp[] = [
  /\.edu$/i,
  /\.ac\.[a-z]{2}$/i,
  /\.edu\.[a-z]{2}$/i,
  /\.gov$/i,
  /\.gov\.[a-z]{2}$/i,
  /\.gob\.[a-z]{2}$/i,
  /\.int$/i,
]

/**
 * Domains that republish other people's listings. Not blocked — often the only
 * way an opportunity surfaces at all — but ranked below the official page and
 * never treated as an official source for a deadline.
 */
export const AGGREGATOR_DOMAINS = new Set<string>([
  'scholarshipscorner.website',
  'opportunitydesk.org',
  'youthop.com',
  'opportunitiesforyouth.org',
  'scholarship-positions.com',
  'afterschoolafrica.com',
])

/**
 * Domains excluded outright: scraped-listing mills and content farms whose
 * pages are auto-generated from other sites. Explicit, reviewable, and editable
 * by an admin — never a silent quality heuristic.
 */
export const BLOCKED_DOMAINS = new Set<string>([])

export function isOfficialDomain(domain: string): boolean {
  if (AGGREGATOR_DOMAINS.has(domain)) return false
  return OFFICIAL_TLD_PATTERNS.some((re) => re.test(domain))
}

export function sourceTier(domain: string): 0 | 1 | 2 | 3 {
  if (BLOCKED_DOMAINS.has(domain)) return 0
  if (isOfficialDomain(domain)) return 3
  if (AGGREGATOR_DOMAINS.has(domain)) return 1
  return 2
}

/** Stable ordering: better sources first, original result order preserved within a tier. */
export function rankHits(hits: SearchHit[]): SearchHit[] {
  return hits
    .map((h, i) => ({ h, i, tier: sourceTier(h.domain) }))
    .filter((x) => x.tier > 0)
    .sort((a, b) => b.tier - a.tier || a.i - b.i)
    .map((x) => x.h)
}
