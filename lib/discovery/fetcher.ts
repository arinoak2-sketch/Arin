import 'server-only'
import { createHash } from 'node:crypto'

/**
 * Stage 3: fetching.
 *
 * robots.txt is honoured before every request. That is partly a legal
 * position and partly the obvious one: a product whose entire claim is
 * trustworthiness does not get to ignore the one machine-readable request a
 * site makes of crawlers.
 */

const USER_AGENT =
  'LumenBot/0.1 (student opportunity discovery; +https://github.com/arinoak2-sketch/Arin)'

const MAX_BYTES = 2_000_000
const TIMEOUT_MS = 8000

export interface FetchOutcome {
  ok: boolean
  url: string
  finalUrl?: string
  status?: number
  html?: string
  contentHash?: string
  fetchedAt: Date
  /** Populated when ok is false. Shown to admins, never shown as an opportunity. */
  error?: string
  errorKind?: 'ROBOTS_DISALLOWED' | 'TIMEOUT' | 'HTTP_ERROR' | 'NOT_HTML' | 'TOO_LARGE' | 'NETWORK'
}

// ── robots.txt ───────────────────────────────────────────────────────────────

interface RobotsRules {
  disallow: string[]
  allow: string[]
  crawlDelayMs: number
}

const robotsCache = new Map<string, { rules: RobotsRules; at: number }>()
const ROBOTS_TTL_MS = 3_600_000

/** Minimal robots.txt parser: the User-agent groups that apply to us. */
export function parseRobots(body: string, userAgent = 'lumenbot'): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [], crawlDelayMs: 0 }
  let applies = false
  let sawSpecific = false

  for (const line of body.split(/\r?\n/)) {
    const clean = line.split('#')[0]!.trim()
    if (!clean) continue
    const [rawField, ...rest] = clean.split(':')
    const field = rawField!.trim().toLowerCase()
    const value = rest.join(':').trim()

    if (field === 'user-agent') {
      const agent = value.toLowerCase()
      if (agent === userAgent) {
        // A group naming us specifically overrides anything matched from '*'.
        if (!sawSpecific) {
          rules.disallow = []
          rules.allow = []
        }
        sawSpecific = true
        applies = true
      } else if (agent === '*' && !sawSpecific) {
        applies = true
      } else {
        applies = false
      }
      continue
    }
    if (!applies) continue
    if (field === 'disallow' && value) rules.disallow.push(value)
    if (field === 'allow' && value) rules.allow.push(value)
    if (field === 'crawl-delay') {
      const n = Number.parseFloat(value)
      if (Number.isFinite(n)) rules.crawlDelayMs = Math.min(n * 1000, 10_000)
    }
  }
  return rules
}

/** Longest-match wins, allow beats disallow at equal length — the usual convention. */
export function robotsAllows(rules: RobotsRules, pathname: string): boolean {
  const match = (patterns: string[]): number => {
    let best = -1
    for (const p of patterns) {
      const prefix = p.endsWith('*') ? p.slice(0, -1) : p
      if (pathname.startsWith(prefix)) best = Math.max(best, prefix.length)
    }
    return best
  }
  const disallowed = match(rules.disallow)
  if (disallowed < 0) return true
  return match(rules.allow) >= disallowed
}

async function loadRobots(origin: string): Promise<RobotsRules> {
  const cached = robotsCache.get(origin)
  if (cached && Date.now() - cached.at < ROBOTS_TTL_MS) return cached.rules

  const empty: RobotsRules = { disallow: [], allow: [], crawlDelayMs: 0 }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timer)
    // No robots.txt means no restriction. A 5xx is ambiguous, so we treat it
    // as no restriction rather than blocking the site indefinitely.
    const rules = res.ok ? parseRobots(await res.text()) : empty
    robotsCache.set(origin, { rules, at: Date.now() })
    return rules
  } catch {
    robotsCache.set(origin, { rules: empty, at: Date.now() })
    return empty
  }
}

// ── per-domain politeness ────────────────────────────────────────────────────

const lastRequestAt = new Map<string, number>()
const MIN_GAP_MS = 1000

async function waitTurn(domain: string, crawlDelayMs: number): Promise<void> {
  const gap = Math.max(MIN_GAP_MS, crawlDelayMs)
  const last = lastRequestAt.get(domain) ?? 0
  const wait = last + gap - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt.set(domain, Date.now())
}

// ── fetch ────────────────────────────────────────────────────────────────────

export async function fetchPage(url: string): Promise<FetchOutcome> {
  const fetchedAt = new Date()
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, url, fetchedAt, error: 'Malformed URL.', errorKind: 'NETWORK' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, url, fetchedAt, error: 'Unsupported protocol.', errorKind: 'NETWORK' }
  }

  const rules = await loadRobots(parsed.origin)
  if (!robotsAllows(rules, parsed.pathname)) {
    return {
      ok: false,
      url,
      fetchedAt,
      error: 'This site asks crawlers not to fetch this page.',
      errorKind: 'ROBOTS_DISALLOWED',
    }
  }

  await waitTurn(parsed.hostname, rules.crawlDelayMs)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en',
      },
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!res.ok) {
      return { ok: false, url, fetchedAt, status: res.status, error: `Server returned ${res.status}.`, errorKind: 'HTTP_ERROR' }
    }
    const contentType = res.headers.get('content-type') ?? ''
    if (!/text\/html|application\/xhtml/i.test(contentType)) {
      return { ok: false, url, fetchedAt, status: res.status, error: `Not an HTML page (${contentType}).`, errorKind: 'NOT_HTML' }
    }
    const declared = Number.parseInt(res.headers.get('content-length') ?? '', 10)
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      return { ok: false, url, fetchedAt, status: res.status, error: 'Page is too large to process.', errorKind: 'TOO_LARGE' }
    }

    const html = await readCapped(res)
    if (html === null) {
      return { ok: false, url, fetchedAt, status: res.status, error: 'Page is too large to process.', errorKind: 'TOO_LARGE' }
    }

    return {
      ok: true,
      url,
      finalUrl: res.url || url,
      status: res.status,
      html,
      contentHash: createHash('sha256').update(html).digest('hex'),
      fetchedAt,
    }
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === 'AbortError'
    return {
      ok: false,
      url,
      fetchedAt,
      error: aborted ? 'The page did not respond in time.' : 'Could not reach the page.',
      errorKind: aborted ? 'TIMEOUT' : 'NETWORK',
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Streams the body, aborting past the cap so a huge page cannot exhaust memory. */
async function readCapped(res: Response): Promise<string | null> {
  const reader = res.body?.getReader()
  if (!reader) return await res.text()

  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > MAX_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  }
  return new TextDecoder('utf-8').decode(concat(chunks, total))
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

/** Strips tracking parameters so two links to the same page dedupe cleanly. */
export function canonicaliseUrl(raw: string): string {
  try {
    const u = new URL(raw)
    u.hash = ''
    const drop = [/^utm_/i, /^fbclid$/i, /^gclid$/i, /^mc_[ce]id$/i, /^ref$/i, /^source$/i]
    for (const key of [...u.searchParams.keys()]) {
      if (drop.some((re) => re.test(key))) u.searchParams.delete(key)
    }
    u.searchParams.sort()
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1)
    u.hostname = u.hostname.replace(/^www\./, '').toLowerCase()
    return u.toString()
  } catch {
    return raw
  }
}
