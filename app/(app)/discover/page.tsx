import { requireUser } from '@/lib/auth/session'
import { searchCapability } from '@/lib/config'
import { describeFilters, emptyFilters, parseNaturalQuery, type DiscoveryFilters } from '@/lib/discovery/queryPlanner'
import { searchBudgetStatus } from '@/lib/discovery/pipeline'
import { loadProfile, loadSavedIds, searchCorpus } from '@/lib/repo/opportunities'
import {
  Card,
  EmptyState,
  Eyebrow,
  Row,
  Stack,
  Tag,
  UnavailableNotice,
} from '@/components/ui/primitives'
import { OpportunityCard } from '@/components/discover/opportunity-card'
import { LiveSearchBanner } from '@/components/discover/live-search'
import { SearchForm } from '@/components/discover/search-form'

export const metadata = { title: 'Discover' }
export const dynamic = 'force-dynamic'

interface SearchParams {
  q?: string
  ineligible?: string
}

/**
 * Discovery.
 *
 * The stored corpus renders immediately; live search runs behind it. The
 * interpreted filters are shown back to the student as chips so a mis-parse is
 * visible and correctable rather than silently shaping their results.
 */
export default async function DiscoverPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser()
  const params = await searchParams
  const query = (params.q ?? '').trim()
  const includeIneligible = params.ineligible === '1'
  const now = new Date()

  const filters: DiscoveryFilters = query ? parseNaturalQuery(query) : emptyFilters()
  const chips = describeFilters(filters)

  const [profile, savedIds, search, budget] = await Promise.all([
    loadProfile(user.id),
    loadSavedIds(user.id),
    Promise.resolve(searchCapability()),
    searchBudgetStatus(now),
  ])

  const results = await searchCorpus({
    filters,
    profile,
    userId: user.id,
    limit: 40,
    includeIneligible,
    now,
  })

  // Counted separately so "12 more you're not eligible for" is honest rather
  // than results silently vanishing.
  const withIneligible = includeIneligible
    ? results
    : await searchCorpus({ filters, profile, userId: user.id, limit: 200, includeIneligible: true, now })
  const ineligibleCount = includeIneligible ? 0 : withIneligible.length - results.length

  return (
    <Stack gap={26}>
      <Stack gap={6}>
        <Eyebrow>Discover</Eyebrow>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.022em' }}>Find something worth your time</h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: '62ch' }}>
          Describe what you are looking for in your own words. Lumen searches the live web and keeps whatever it
          finds, so results get better the more it is used.
        </p>
      </Stack>

      <SearchForm initialQuery={query} />

      {chips.length > 0 ? (
        <Card style={{ background: 'var(--surface-sunken)' }}>
          <Stack gap={9}>
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Lumen read your search as follows. If any of this is wrong, rephrase and it will re-read it.
            </span>
            <Row gap={7}>
              {chips.map((chip, i) => (
                <Tag key={`${chip.field}-${i}`}>
                  <span style={{ color: 'var(--text-tertiary)', marginRight: 5 }}>{chip.label}</span>
                  {chip.value}
                </Tag>
              ))}
            </Row>
          </Stack>
        </Card>
      ) : null}

      {!search.available ? (
        <UnavailableNotice title="Live discovery is not configured" reason={search.reason!} />
      ) : (
        <LiveSearchBanner query={query} enabled={search.available && query.length > 0} />
      )}

      {search.available && budget.remaining <= 50 && budget.remaining > 0 ? (
        <UnavailableNotice
          tone="soon"
          title="Live search allowance is nearly used up"
          reason={`${budget.remaining} of this month's ${budget.limit} live searches remain. Lumen will keep serving stored results after that.`}
        />
      ) : null}

      <Stack gap={14}>
        <Row gap={12} style={{ justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 17, fontWeight: 650 }}>
            {results.length} {results.length === 1 ? 'opportunity' : 'opportunities'}
            {query ? <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> for “{query}”</span> : null}
          </h2>
          <Row gap={14}>
            <a href="/compare" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Compare saved
            </a>
            {ineligibleCount > 0 ? (
            <a
              href={`/discover?${new URLSearchParams({ ...(query ? { q: query } : {}), ineligible: '1' }).toString()}`}
              style={{ fontSize: 13, color: 'var(--text-secondary)' }}
            >
              Show {ineligibleCount} you are not eligible for
            </a>
            ) : includeIneligible ? (
              <a
                href={`/discover?${new URLSearchParams(query ? { q: query } : {}).toString()}`}
                style={{ fontSize: 13, color: 'var(--text-secondary)' }}
              >
                Hide ineligible
              </a>
            ) : null}
          </Row>
        </Row>

        {results.length === 0 ? (
          <EmptyState
            icon="◈"
            title={query ? 'Nothing stored matches that yet' : 'Search for something to begin'}
            description={
              query
                ? search.available
                  ? 'Lumen is searching the live web for this now. If it finds anything readable, it will appear here — refresh in a moment.'
                  : 'Live discovery is not configured on this deployment, so Lumen can only show opportunities already in its corpus.'
                : 'Try “free online research programmes for high school students” or “scholarships for undergraduates in Canada”.'
            }
          />
        ) : (
          <div className="stagger" style={{ display: 'grid', gap: 14 }}>
            {results.map((item) => (
              <div key={item.record.id} className="animate-rise">
                <OpportunityCard item={item} saved={savedIds.has(item.record.id)} />
              </div>
            ))}
          </div>
        )}
      </Stack>
    </Stack>
  )
}
