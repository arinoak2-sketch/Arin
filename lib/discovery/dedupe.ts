/**
 * Stage 6: duplicate detection.
 *
 * The same programme appears on the university page, three aggregators and a
 * blog. A student should see it once, with all five sources attached.
 *
 * The layers run cheapest-first and stop at the first confident answer. The
 * asymmetry that governs the thresholds: a wrong MERGE destroys two distinct
 * opportunities and can show a student the wrong deadline, while a wrong SPLIT
 * only shows a duplicate. So anything short of confident goes to a human.
 */

export type DuplicateVerdict = 'SAME' | 'REVIEW' | 'DIFFERENT'

export interface DedupeCandidate {
  id?: string
  canonicalUrl: string
  contentHash?: string | null
  title: string
  organizationDomain?: string | null
  cycleYear?: number | null
}

export interface DedupeResult {
  verdict: DuplicateVerdict
  /** 0–1. Only meaningful for the similarity layer. */
  similarity: number
  reason: string
}

/** Words that carry no distinguishing signal in this domain. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'for', 'and', 'in', 'on', 'at', 'to', 'with',
  'programme', 'program', 'opportunity', 'application', 'applications',
  'apply', 'online', 'international', 'national', 'official', 'website',
])

export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    // A year in the title is cycle information, not identity — it is compared
    // separately so the 2026 and 2027 cycles do not collapse into each other.
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function titleTokens(title: string): string[] {
  return normaliseTitle(title)
    .split(' ')
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

/** Character trigram similarity (Dice coefficient) — robust to word order. */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string): Set<string> => {
    const padded = `  ${s} `
    const out = new Set<string>()
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
    return out
  }
  const A = grams(normaliseTitle(a))
  const B = grams(normaliseTitle(b))
  if (A.size === 0 || B.size === 0) return 0
  let shared = 0
  for (const g of A) if (B.has(g)) shared++
  return (2 * shared) / (A.size + B.size)
}

export function tokenOverlap(a: string, b: string): number {
  const A = new Set(titleTokens(a))
  const B = new Set(titleTokens(b))
  if (A.size === 0 || B.size === 0) return 0
  let shared = 0
  for (const t of A) if (B.has(t)) shared++
  return shared / Math.min(A.size, B.size)
}

export const MERGE_THRESHOLD = 0.9
export const REVIEW_THRESHOLD = 0.75

export function compare(a: DedupeCandidate, b: DedupeCandidate): DedupeResult {
  // Different cycles of a recurring opportunity are different records, always.
  // This check comes first so no later layer can collapse 2026 into 2027.
  if (a.cycleYear != null && b.cycleYear != null && a.cycleYear !== b.cycleYear) {
    return { verdict: 'DIFFERENT', similarity: 0, reason: `Different cycles (${a.cycleYear} and ${b.cycleYear}).` }
  }

  if (a.canonicalUrl && a.canonicalUrl === b.canonicalUrl) {
    return { verdict: 'SAME', similarity: 1, reason: 'Identical canonical URL.' }
  }

  if (a.contentHash && b.contentHash && a.contentHash === b.contentHash) {
    return { verdict: 'SAME', similarity: 1, reason: 'Byte-identical page content.' }
  }

  const sameOrg =
    !!a.organizationDomain && !!b.organizationDomain && a.organizationDomain === b.organizationDomain

  const trigram = trigramSimilarity(a.title, b.title)
  const tokens = tokenOverlap(a.title, b.title)
  const similarity = Math.max(trigram, tokens * 0.95)

  if (sameOrg && similarity >= MERGE_THRESHOLD) {
    return { verdict: 'SAME', similarity, reason: 'Same organiser and a near-identical title.' }
  }
  if (similarity >= REVIEW_THRESHOLD) {
    return {
      verdict: 'REVIEW',
      similarity,
      reason: sameOrg
        ? 'Same organiser and a similar title — too close to merge automatically.'
        : 'Similar titles from different domains — likely the same opportunity republished.',
    }
  }
  // A very high title match across different organisers is still only a review:
  // two universities can run programmes with genuinely identical names.
  if (similarity >= MERGE_THRESHOLD && !sameOrg) {
    return { verdict: 'REVIEW', similarity, reason: 'Identical titles from different organisers.' }
  }

  return { verdict: 'DIFFERENT', similarity, reason: 'Titles are not similar enough to be the same opportunity.' }
}

export interface DedupeMatch {
  candidate: DedupeCandidate
  result: DedupeResult
}

/** Best match in a corpus, if any. Callers merge on SAME and queue on REVIEW. */
export function findDuplicate(incoming: DedupeCandidate, corpus: DedupeCandidate[]): DedupeMatch | null {
  let best: DedupeMatch | null = null
  for (const candidate of corpus) {
    const result = compare(incoming, candidate)
    if (result.verdict === 'DIFFERENT') continue
    if (!best || result.similarity > best.result.similarity) best = { candidate, result }
    if (result.verdict === 'SAME' && result.similarity === 1) break
  }
  return best
}

/**
 * Reads a cycle year from a title or URL — "2026 cycle" vs "2027 cycle".
 * Returns null rather than defaulting to the current year, because assuming a
 * cycle is how last year's deadline silently becomes this year's.
 */
export function detectCycleYear(title: string, url: string): number | null {
  const thisYear = new Date().getUTCFullYear()
  const candidates: number[] = []
  for (const source of [title, url]) {
    for (const m of source.matchAll(/\b(20\d{2})\b/g)) {
      const y = Number(m[1])
      if (y >= thisYear - 1 && y <= thisYear + 3) candidates.push(y)
    }
  }
  if (candidates.length === 0) return null
  return Math.max(...candidates)
}
