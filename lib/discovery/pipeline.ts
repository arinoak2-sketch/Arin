import 'server-only'
import { braveMonthlyBudget } from '@/lib/config'
import { prisma } from '@/lib/db/client'
import { encodeJson, slugify } from '@/lib/db/codec'
import { braveProvider } from './brave'
import { compare, detectCycleYear, type DedupeCandidate } from './dedupe'
import { fillGapsWithAi } from './extract/ai'
import { extractFromHtml, type ExtractionResult } from './extract/structured'
import { canonicaliseUrl, fetchPage } from './fetcher'
import { encodeProvenance, requiresHumanConfirmation, type ProvenanceMap } from './provenance'
import { domainOf, isOfficialDomain, rankHits, SearchUnavailableError, type SearchHit } from './provider'
import { planQueries, type DiscoveryFilters, type ProfileSeed } from './queryPlanner'

/**
 * The discovery pipeline: the seven stages in docs/06-discovery-pipeline.md.
 *
 * Called in the background after the corpus has already been rendered, so a
 * student never waits on a cold network round-trip to see anything at all.
 */

export interface DiscoveryOutcome {
  ok: boolean
  queriesRun: string[]
  hitsConsidered: number
  created: number
  merged: number
  queuedForReview: number
  skipped: Array<{ url: string; reason: string }>
  /** Set when discovery could not run. Shown to the student verbatim. */
  unavailableReason?: string
  unavailableKind?: 'NOT_CONFIGURED' | 'QUOTA_EXHAUSTED' | 'RATE_LIMITED' | 'PROVIDER_ERROR'
  durationMs: number
}

const MAX_PAGES_PER_RUN = 8

// ── budget ───────────────────────────────────────────────────────────────────

const periodKey = (at: Date): string =>
  `brave:${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`

/**
 * Reserves quota before spending it. Pausing deliberately and saying so beats
 * overrunning the free tier and having requests fail mid-session.
 */
async function reserveQueries(count: number, now: Date): Promise<number> {
  const key = periodKey(now)
  const limit = braveMonthlyBudget()
  const budget = await prisma.searchBudget.upsert({
    where: { periodKey: key },
    create: { periodKey: key, used: 0, limit },
    update: { limit },
  })
  const remaining = Math.max(0, budget.limit - budget.used)
  const granted = Math.min(count, remaining)
  if (granted > 0) {
    await prisma.searchBudget.update({
      where: { periodKey: key },
      data: { used: { increment: granted }, exhaustedAt: granted < count ? now : null },
    })
  }
  return granted
}

export async function searchBudgetStatus(now: Date = new Date()) {
  const budget = await prisma.searchBudget.findUnique({ where: { periodKey: periodKey(now) } })
  const limit = budget?.limit ?? braveMonthlyBudget()
  const used = budget?.used ?? 0
  return { used, limit, remaining: Math.max(0, limit - used), exhausted: used >= limit }
}

// ── the run ──────────────────────────────────────────────────────────────────

export interface DiscoveryInput {
  filters: DiscoveryFilters
  profile: ProfileSeed | null
  userId?: string
  rawQuery: string
}

export async function runDiscovery(input: DiscoveryInput): Promise<DiscoveryOutcome> {
  const startedAt = Date.now()
  const now = new Date()
  const outcome: DiscoveryOutcome = {
    ok: false, queriesRun: [], hitsConsidered: 0, created: 0, merged: 0,
    queuedForReview: 0, skipped: [], durationMs: 0,
  }

  if (!braveProvider.isConfigured()) {
    outcome.unavailableKind = 'NOT_CONFIGURED'
    outcome.unavailableReason =
      'Live discovery is not configured yet, so these are opportunities Lumen has already found and stored.'
    outcome.durationMs = Date.now() - startedAt
    return outcome
  }

  const planned = planQueries(input.filters, input.profile)
  const granted = await reserveQueries(planned.length, now)
  if (granted === 0) {
    outcome.unavailableKind = 'QUOTA_EXHAUSTED'
    outcome.unavailableReason =
      'Lumen has used this month’s live search allowance, so these are stored results. Live search resumes next month.'
    outcome.durationMs = Date.now() - startedAt
    return outcome
  }

  // ── 2. Search ──
  const hits: SearchHit[] = []
  for (const q of planned.slice(0, granted)) {
    try {
      const found = await braveProvider.search({
        q,
        count: 10,
        country: input.filters.countryCode ?? input.profile?.countryCode ?? undefined,
        language: 'en',
      })
      outcome.queriesRun.push(q)
      hits.push(...found)
    } catch (error) {
      if (error instanceof SearchUnavailableError) {
        outcome.unavailableKind = error.kind
        outcome.unavailableReason = friendlyReason(error)
        break
      }
      throw error
    }
  }

  const ranked = dedupeHits(rankHits(hits))
  outcome.hitsConsidered = ranked.length

  await prisma.discoveryQuery.create({
    data: {
      userId: input.userId ?? null,
      rawQuery: input.rawQuery,
      interpretedFilters: encodeJson(input.filters),
      provider: 'brave',
      resultCount: ranked.length,
      latencyMs: Date.now() - startedAt,
      error: outcome.unavailableReason ?? null,
    },
  })

  // ── 3–7. Fetch, extract, normalise, dedupe, persist ──
  for (const hit of ranked.slice(0, MAX_PAGES_PER_RUN)) {
    try {
      const result = await ingestHit(hit, now, 'BRAVE')
      if (result.status === 'created') outcome.created++
      else if (result.status === 'merged') outcome.merged++
      else if (result.status === 'review') outcome.queuedForReview++
      else outcome.skipped.push({ url: hit.url, reason: result.reason ?? 'Could not be processed.' })
    } catch {
      outcome.skipped.push({ url: hit.url, reason: 'Could not be processed.' })
    }
  }

  outcome.ok = outcome.unavailableReason === undefined
  outcome.durationMs = Date.now() - startedAt
  return outcome
}

/** Where a source came from. Recorded verbatim; never assumed. */
export type IngestOrigin = 'BRAVE' | 'ADMIN'

export interface IngestResult {
  status: 'created' | 'merged' | 'review' | 'rejected'
  /** Present when a record was created, so a caller can link straight to it. */
  slug?: string
  title?: string
  /** Present when status is 'rejected' — plain language, safe to show. */
  reason?: string
}

const rejected = (reason: string): IngestResult => ({ status: 'rejected', reason })

async function ingestHit(
  hit: SearchHit,
  now: Date,
  origin: IngestOrigin,
  actorUserId?: string,
): Promise<IngestResult> {
  const canonical = canonicaliseUrl(hit.url)

  // Already known? Record the source sighting and move on.
  const existingSource = await prisma.opportunitySource.findFirst({
    where: { url: canonical },
    select: { opportunityId: true },
  })
  if (existingSource) {
    await prisma.opportunitySource.updateMany({
      where: { url: canonical },
      data: { fetchedAt: now },
    })
    const known = await prisma.opportunity.findUnique({
      where: { id: existingSource.opportunityId },
      select: { slug: true, title: true },
    })
    return { status: 'merged', slug: known?.slug, title: known?.title }
  }

  // ── 3. Fetch ──
  const fetched = await fetchPage(hit.url)
  if (!fetched.ok || !fetched.html) return rejected(fetched.error ?? 'Could not be fetched.')

  // ── 4. Extract ──
  const extraction = extractFromHtml(fetched.html, fetched.finalUrl ?? hit.url, fetched.fetchedAt)
  const aiReport = await fillGapsWithAi(extraction, fetched.finalUrl ?? hit.url, fetched.fetchedAt)

  const title = extraction.title?.value ?? hit.title
  if (!title || title.trim().length < 4) return rejected('No usable title on the page.')

  // ── 5. Normalise ──
  const domain = domainOf(fetched.finalUrl ?? hit.url)
  const official = isOfficialDomain(domain)
  const cycleYear = detectCycleYear(title, canonical)

  const candidate: DedupeCandidate = {
    canonicalUrl: canonical,
    contentHash: fetched.contentHash,
    title,
    organizationDomain: domain,
    cycleYear,
  }

  // ── 6. Dedupe against the corpus ──
  const corpus = await prisma.opportunity.findMany({
    where: { verificationState: { not: 'ARCHIVED' } },
    select: {
      id: true, title: true, cycleYear: true,
      sources: { select: { url: true, domain: true, contentHash: true }, take: 5 },
    },
    take: 500,
    orderBy: { updatedAt: 'desc' },
  })

  let bestId: string | null = null
  let needsReview = false
  for (const existing of corpus) {
    for (const source of existing.sources.length > 0 ? existing.sources : [{ url: '', domain: null, contentHash: null }]) {
      const verdict = compare(candidate, {
        id: existing.id,
        canonicalUrl: source.url,
        contentHash: source.contentHash,
        title: existing.title,
        organizationDomain: source.domain,
        cycleYear: existing.cycleYear,
      })
      if (verdict.verdict === 'SAME') {
        bestId = existing.id
        break
      }
      if (verdict.verdict === 'REVIEW') needsReview = true
    }
    if (bestId) break
  }

  // A confident match gains a source rather than creating a second listing.
  if (bestId) {
    await prisma.opportunitySource.create({
      data: {
        opportunityId: bestId,
        url: canonical,
        domain,
        isOfficial: official,
        discoveredVia: origin,
        fetchedAt: fetched.fetchedAt,
        httpStatus: fetched.status ?? null,
        contentHash: fetched.contentHash ?? null,
        extractionMethod: aiReport.attempted ? 'AI_EXTRACTED' : 'STRUCTURED_MARKUP',
        title: hit.title,
        snippet: hit.snippet,
      },
    })
    await prisma.verificationEvent.create({
      data: {
        opportunityId: bestId,
        actor: origin === 'ADMIN' ? 'ADMIN' : 'SYSTEM',
        actorUserId: actorUserId ?? null,
        action: 'FETCH_CONFIRMED',
        fieldsTouched: encodeJson(['sources']),
        note: `Additional source found at ${domain}.`,
      },
    })
    const merged = await prisma.opportunity.findUnique({
      where: { id: bestId },
      select: { slug: true, title: true },
    })
    return { status: 'merged', slug: merged?.slug, title: merged?.title }
  }

  // ── 7. Persist with provenance ──
  const provenance = buildProvenanceMap(extraction)
  const state = decideVerificationState(extraction, provenance, official)
  if (state === 'NEEDS_REVIEW') needsReview = true

  const created = await prisma.opportunity.create({
    data: {
      slug: slugify(title, fetched.contentHash ?? Math.random().toString(36).slice(2)),
      title: title.slice(0, 300),
      summary: extraction.summary?.value.slice(0, 1200) ?? hit.snippet.slice(0, 1200) ?? null,
      format: extraction.format?.value ?? 'UNKNOWN',
      locationCountry: extraction.locationCountry?.value ?? null,
      locationCity: extraction.locationCity?.value ?? null,
      costType: extraction.costType?.value ?? 'UNKNOWN',
      costAmount: extraction.costAmount?.value ?? null,
      costCurrency: extraction.costCurrency?.value ?? null,
      officialUrl: fetched.finalUrl ?? hit.url,
      cycleYear,
      cycleLabel: cycleYear ? `${cycleYear} cycle` : null,
      verificationState: state,
      firstSeenAt: now,
      lastFetchedAt: fetched.fetchedAt,
      fieldProvenance: encodeProvenance(provenance),
      requirements: encodeJson(
        extraction.requirements.map((r) => ({ label: r.value.label, rawText: r.provenance.rawText })),
      ),
      statedBenefits: encodeJson(
        extraction.statedBenefits.map((b) => ({
          label: b.value.label,
          rawText: b.provenance.rawText,
          sourceUrl: b.provenance.sourceUrl,
        })),
      ),
      sources: {
        create: {
          url: canonical,
          domain,
          isOfficial: official,
          discoveredVia: origin,
          fetchedAt: fetched.fetchedAt,
          httpStatus: fetched.status ?? null,
          contentHash: fetched.contentHash ?? null,
          extractionMethod: aiReport.attempted ? 'AI_EXTRACTED' : 'STRUCTURED_MARKUP',
          title: hit.title,
          snippet: hit.snippet,
        },
      },
      deadlines: {
        create: extraction.deadlines
          .filter((d) => d.value.isRollingAdmission || d.value.date.getTime() > 0)
          .map((d) => ({
            kind: d.value.kind,
            date: d.value.date,
            isRollingAdmission: d.value.isRollingAdmission,
            rawText: d.provenance.rawText ?? null,
            provenance: encodeJson(d.provenance),
          })),
      },
      eligibility: {
        create: extraction.ageRange
          ? [
              {
                dimension: 'AGE',
                operator: 'BETWEEN',
                value: encodeJson(extraction.ageRange.value),
                rawText: extraction.ageRange.provenance.rawText ?? 'Age requirement stated on the page',
                provenance: encodeJson(extraction.ageRange.provenance),
                confidence: extraction.ageRange.provenance.confidence,
              },
            ]
          : [],
      },
      verifications: {
        create: {
          // An admin supplying a URL is a person taking an action, and the
          // audit trail says so. It does not make the *content* admin-entered:
          // every field keeps the provenance the extractor gave it.
          actor: origin === 'ADMIN' ? 'ADMIN' : 'SYSTEM',
          actorUserId: actorUserId ?? null,
          action: 'DISCOVERED',
          fieldsTouched: encodeJson(Object.keys(provenance)),
          note: `${origin === 'ADMIN' ? 'Added by URL.' : 'Discovered via search.'} ${
            aiReport.attempted
              ? `AI filled ${aiReport.filled.length} field(s); ${aiReport.rejected.length} rejected as not present in the page text.`
              : 'Extracted from page markup and text only.'
          }`,
        },
      },
    },
  })

  return {
    status: needsReview ? 'review' : 'created',
    slug: created.slug,
    title: created.title,
  }
}

/**
 * Adds one opportunity from a URL you supply, without going through search.
 *
 * Why this exists: until a Brave key is configured there is no way to put a
 * single real opportunity into the corpus, so the whole product can only be
 * seen against test fixtures. That made live search a prerequisite for
 * evaluating anything, which it should not be.
 *
 * This is not a shortcut around the trust rules — it is the same pipeline.
 * The page is fetched through the same SSRF-guarded fetcher, extracted by the
 * same extractor, deduped against the same corpus, and stamped with the same
 * per-field provenance. Supplying the URL asserts nothing about the content:
 * an admin choosing which page to read is not an admin vouching for what it
 * says, so nothing here can reach VERIFIED without a separate human review.
 * The only difference from a search result is that the source records ADMIN
 * rather than BRAVE, because that is what actually happened.
 */
export async function ingestUrl(
  rawUrl: string,
  options: { actorUserId?: string; now?: Date } = {},
): Promise<IngestResult> {
  const now = options.now ?? new Date()
  const trimmed = rawUrl.trim()
  if (trimmed.length === 0) return rejected('Enter the address of the opportunity page.')

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return rejected('That is not a valid web address. It should start with https://')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return rejected('Only http and https addresses can be read.')
  }

  // A SearchHit is just the shape the pipeline takes. Title and snippet are
  // left empty on purpose: with no search provider there is no third-party
  // description, and inventing one would put unsourced text into the record.
  // The extractor reads the title from the page itself, or the page is refused.
  const hit: SearchHit = {
    url: parsed.toString(),
    title: '',
    snippet: '',
    domain: domainOf(parsed.toString()),
  }

  try {
    return await ingestHit(hit, now, 'ADMIN', options.actorUserId)
  } catch {
    return rejected('That page could not be processed. Check the address and try again.')
  }
}

function buildProvenanceMap(e: ExtractionResult): ProvenanceMap {
  const map: ProvenanceMap = {}
  if (e.title) map.title = e.title.provenance
  if (e.summary) map.summary = e.summary.provenance
  if (e.organizerName) map.organizerName = e.organizerName.provenance
  if (e.format) map.format = e.format.provenance
  if (e.locationCountry) map.locationCountry = e.locationCountry.provenance
  if (e.locationCity) map.locationCity = e.locationCity.provenance
  if (e.costType) map.costType = e.costType.provenance
  if (e.costAmount) map.costAmount = e.costAmount.provenance
  if (e.ageRange) map.eligibility = e.ageRange.provenance
  const appDeadline = e.deadlines.find((d) => d.value.kind === 'APPLICATION_DEADLINE')
  if (appDeadline) map.applicationDeadline = appDeadline.provenance
  return map
}

/**
 * Nothing reaches VERIFIED without a human. The best an automated run can do is
 * RECENTLY_VERIFIED, and only when the key fields came from an official
 * domain's own structured markup.
 */
function decideVerificationState(
  e: ExtractionResult,
  provenance: ProvenanceMap,
  official: boolean,
): 'RECENTLY_VERIFIED' | 'NEEDS_REVIEW' | 'UNVERIFIED' {
  for (const [field, p] of Object.entries(provenance)) {
    if (requiresHumanConfirmation(field, p.method)) return 'NEEDS_REVIEW'
  }
  const hasDeadline = e.deadlines.some((d) => d.value.kind === 'APPLICATION_DEADLINE')
  const keyFieldsFromMarkup =
    e.title?.provenance.method === 'STRUCTURED_MARKUP' &&
    provenance.applicationDeadline?.method === 'STRUCTURED_MARKUP'

  if (official && keyFieldsFromMarkup) return 'RECENTLY_VERIFIED'
  if (!hasDeadline || !e.title) return 'UNVERIFIED'
  return official ? 'RECENTLY_VERIFIED' : 'NEEDS_REVIEW'
}

function dedupeHits(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>()
  return hits.filter((h) => {
    const key = canonicaliseUrl(h.url)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function friendlyReason(error: SearchUnavailableError): string {
  switch (error.kind) {
    case 'NOT_CONFIGURED':
      return 'Live discovery is not configured, so these are opportunities Lumen has already found and stored.'
    case 'QUOTA_EXHAUSTED':
      return 'Lumen has used this month’s live search allowance. These are stored results.'
    case 'RATE_LIMITED':
      return 'Live search is busy right now. These are stored results — try again shortly.'
    default:
      return 'Live search could not be reached just now. These are stored results.'
  }
}

/**
 * Expiry sweep: an opportunity whose application deadline has passed becomes
 * EXPIRED, visibly and with an audit entry. The old date is never carried
 * forward into a new year — a new cycle is a new record.
 */
export async function sweepExpired(now: Date = new Date()): Promise<number> {
  const candidates = await prisma.opportunity.findMany({
    where: { verificationState: { notIn: ['EXPIRED', 'ARCHIVED'] } },
    select: {
      id: true,
      deadlines: { select: { kind: true, date: true, isRollingAdmission: true } },
    },
  })

  const expired = candidates.filter((o) => {
    const actionable = o.deadlines.filter(
      (d) => d.kind === 'APPLICATION_DEADLINE' || d.kind === 'REGISTRATION_DEADLINE',
    )
    if (actionable.length === 0) return false
    if (actionable.some((d) => d.isRollingAdmission)) return false
    return actionable.every((d) => d.date.getTime() < now.getTime())
  })

  for (const o of expired) {
    await prisma.opportunity.update({
      where: { id: o.id },
      data: { verificationState: 'EXPIRED' },
    })
    await prisma.verificationEvent.create({
      data: {
        opportunityId: o.id,
        actor: 'SYSTEM',
        action: 'MARKED_EXPIRED',
        fieldsTouched: encodeJson(['verificationState']),
        note: 'Application deadline passed with no future cycle recorded.',
      },
    })
  }
  return expired.length
}
