import * as cheerio from 'cheerio'
import { makeProvenance, type FieldProvenance } from '../provenance'
import { extractAgeRange, extractCost, extractDates, extractFormat, extractRequirements, parseDate } from './patterns'

/**
 * Stage 4a/4b: deterministic extraction.
 *
 * Structured markup first — JSON-LD, microdata and OpenGraph are published by
 * the organiser for machines to read, so anything found there is the highest
 * confidence a non-human source can have. Only what remains null after that
 * falls through to labelled-text parsing, and only what remains null after
 * *that* is ever offered to the AI stage.
 */

export interface ExtractedField<T> {
  value: T
  provenance: FieldProvenance
}

export interface ExtractionResult {
  title: ExtractedField<string> | null
  summary: ExtractedField<string> | null
  organizerName: ExtractedField<string> | null
  format: ExtractedField<'ONLINE' | 'IN_PERSON' | 'HYBRID' | 'UNKNOWN'> | null
  locationCountry: ExtractedField<string> | null
  locationCity: ExtractedField<string> | null
  costType: ExtractedField<'FREE' | 'PAID' | 'FREE_WITH_AID' | 'UNKNOWN'> | null
  costAmount: ExtractedField<number> | null
  costCurrency: ExtractedField<string> | null
  ageRange: ExtractedField<{ min: number | null; max: number | null }> | null
  deadlines: Array<ExtractedField<{ kind: string; date: Date; isRollingAdmission: boolean }>>
  requirements: Array<ExtractedField<{ label: string }>>
  statedBenefits: Array<ExtractedField<{ label: string }>>
  /** Plain page text, kept for the AI stage and for admin review. */
  text: string
  /** Which fields are still null and would need the AI stage. */
  gaps: string[]
}

/** schema.org types worth reading. Anything else is treated as an ordinary page. */
const RELEVANT_TYPES = new Set([
  'EducationalOccupationalProgram',
  'Course',
  'CourseInstance',
  'Event',
  'EducationEvent',
  'BusinessEvent',
  'Scholarship',
  'MonetaryGrant',
  'JobPosting',
])

interface JsonLdNode {
  [key: string]: unknown
}

function collectJsonLd($: cheerio.CheerioAPI): JsonLdNode[] {
  const nodes: JsonLdNode[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text()
    if (!raw.trim()) return
    try {
      const parsed: unknown = JSON.parse(raw)
      const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed]
      while (queue.length > 0) {
        const node = queue.shift()
        if (typeof node !== 'object' || node === null) continue
        const obj = node as JsonLdNode
        if (Array.isArray(obj['@graph'])) queue.push(...(obj['@graph'] as unknown[]))
        nodes.push(obj)
      }
    } catch {
      // Malformed JSON-LD is common. Skip it silently and fall through to text.
    }
  })
  return nodes
}

const typeOf = (node: JsonLdNode): string[] => {
  const t = node['@type']
  if (typeof t === 'string') return [t]
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  return []
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null

/**
 * Reads a number, refusing anything that is not actually one.
 *
 * The obvious implementation — strip non-digits, then Number() — has a trap:
 * "contact us" reduces to the empty string, and Number('') is 0. A price of 0
 * publishes "Free" at HIGH confidence, so a page that declined to state its fee
 * would be advertised to students as free. The digits must be present in the
 * source, and thousands separators are the only punctuation removed.
 */
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  // Optional currency symbol/code, then a number that must contain a digit.
  const m = /^[^\d.,-]*(-?\d[\d,]*(?:\.\d+)?)[^\d]*$/.exec(trimmed)
  if (!m?.[1]) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

export function extractFromHtml(html: string, url: string, fetchedAt: Date = new Date()): ExtractionResult {
  const $ = cheerio.load(html)
  const markup = (rawText?: string) => makeProvenance('STRUCTURED_MARKUP', url, rawText, fetchedAt)
  const pageText = (rawText?: string) => makeProvenance('LABELLED_PAGE_TEXT', url, rawText, fetchedAt)

  const result: ExtractionResult = {
    title: null, summary: null, organizerName: null, format: null,
    locationCountry: null, locationCity: null, costType: null, costAmount: null,
    costCurrency: null, ageRange: null, deadlines: [], requirements: [],
    statedBenefits: [], text: '', gaps: [],
  }

  // ── 4a. Structured markup ──────────────────────────────────────────────────
  const nodes = collectJsonLd($)
  const relevant = nodes.filter((n) => typeOf(n).some((t) => RELEVANT_TYPES.has(t)))

  for (const node of relevant) {
    const name = str(node.name) ?? str(node.headline)
    if (name && !result.title) result.title = { value: name, provenance: markup(name) }

    const desc = str(node.description)
    if (desc && !result.summary) result.summary = { value: desc, provenance: markup(desc) }

    const provider = node.provider ?? node.organizer ?? node.sponsor ?? node.funder
    if (provider && !result.organizerName) {
      const pname =
        typeof provider === 'object' && provider !== null ? str((provider as JsonLdNode).name) : str(provider)
      if (pname) result.organizerName = { value: pname, provenance: markup(pname) }
    }

    /*
     * Typed dates.
     *
     * applicationStartDate is when applications OPEN, not when they close.
     * Reading it as a deadline would show a student "deadline: 15 January" for
     * a programme that closes in June — telling them to rush, or that they have
     * missed something still open. Each schema property maps to exactly the
     * kind it means, and nothing maps to APPLICATION_DEADLINE by approximation.
     */
    const DATE_PROPERTIES = [
      ['applicationDeadline', 'APPLICATION_DEADLINE'],
      ['applicationStartDate', 'APPLICATION_OPENS'],
      ['startDate', 'PROGRAM_START'],
      ['endDate', 'PROGRAM_END'],
    ] as const
    for (const [key, kind] of DATE_PROPERTIES) {
      const raw = str(node[key])
      if (!raw) continue
      const parsed = parseDate(raw)
      if (!parsed) continue
      pushDeadline(result, kind, parsed.date, markup(raw))
    }

    /*
     * Attendance mode.
     *
     * Only the vocabulary schema.org actually defines is recognised. An
     * unrecognised value such as "self-paced" or "full-time" says nothing about
     * whether a student would have to travel, and format carries real weight in
     * matching — so it is left null for the text stage rather than defaulted to
     * in-person, which was silently inventing a travel requirement.
     */
    const mode = str(node.courseMode) ?? str(node.eventAttendanceMode)
    if (mode && !result.format) {
      const f = attendanceMode(mode)
      if (f) result.format = { value: f, provenance: markup(mode) }
    }

    // Location
    const loc = node.location
    if (typeof loc === 'object' && loc !== null) {
      const addr = (loc as JsonLdNode).address
      if (typeof addr === 'object' && addr !== null) {
        const a = addr as JsonLdNode
        const country = str(a.addressCountry)
        const city = str(a.addressLocality)
        if (country && !result.locationCountry) result.locationCountry = { value: country, provenance: markup(country) }
        if (city && !result.locationCity) result.locationCity = { value: city, provenance: markup(city) }
      }
    }

    // Offers → cost
    const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers
    if (typeof offers === 'object' && offers !== null && !result.costType) {
      const o = offers as JsonLdNode
      const price = num(o.price)
      const currency = str(o.priceCurrency)
      if (price !== null) {
        result.costType = {
          value: price === 0 ? 'FREE' : 'PAID',
          provenance: markup(`price: ${price} ${currency ?? ''}`.trim()),
        }
        if (price > 0) {
          result.costAmount = { value: price, provenance: markup(String(price)) }
          if (currency) result.costCurrency = { value: currency, provenance: markup(currency) }
        }
      }
    }

    // Age
    const typicalAge = str(node.typicalAgeRange)
    if (typicalAge && !result.ageRange) {
      const m = /(\d{1,2})\s*-\s*(\d{1,2})/.exec(typicalAge)
      if (m) {
        result.ageRange = {
          value: { min: Number(m[1]), max: Number(m[2]) },
          provenance: markup(typicalAge),
        }
      }
    }
  }

  // OpenGraph / meta as a fallback for the basics only.
  /*
   * OpenGraph is markup the publisher wrote for machines, so it keeps the
   * STRUCTURED_MARKUP method. The <title> element is not: it is prose, usually
   * carrying site branding ("Programme | Example University"), and students are
   * told STRUCTURED_MARKUP means "published in the page's own structured data
   * by the organiser". Attributing a title tag that way would make that
   * sentence untrue, so it drops a tier.
   */
  if (!result.title) {
    const og = $('meta[property="og:title"]').attr('content')?.trim()
    if (og) {
      result.title = { value: og, provenance: markup(og) }
    } else {
      const titleTag = $('title').first().text().trim()
      if (titleTag) result.title = { value: titleTag, provenance: pageText(titleTag) }
    }
  }
  if (!result.summary) {
    const og =
      $('meta[property="og:description"]').attr('content') ?? $('meta[name="description"]').attr('content')
    if (og?.trim()) result.summary = { value: og.trim(), provenance: markup(og.trim()) }
  }
  if (!result.organizerName) {
    const site = $('meta[property="og:site_name"]').attr('content')
    if (site?.trim()) result.organizerName = { value: site.trim(), provenance: markup(site.trim()) }
  }

  // ── 4b. Labelled page text ─────────────────────────────────────────────────
  $('script, style, noscript, svg, nav, footer, header, form').remove()
  const text = $('body').text().replace(/\s+/g, ' ').trim()
  result.text = text

  // Only fill what markup did not already provide. Markup always wins.
  const referenceYear = new Date(fetchedAt).getUTCFullYear()
  /*
   * Text dates fill in per KIND, not all-or-nothing. The old condition skipped
   * the text scan entirely once markup had produced any date at all, so a page
   * publishing only startDate in JSON-LD and "applications close 3 March" in
   * prose lost the one date the student actually needed.
   */
  const kindsFromMarkup = new Set(result.deadlines.map((d) => d.value.kind))
  for (const d of extractDates(text, referenceYear)) {
    if (kindsFromMarkup.has(d.kind)) continue
    pushDeadline(result, d.kind, d.date, pageText(d.rawText), d.isRollingAdmission)
  }
  if (!result.format) {
    const f = extractFormat(text)
    if (f.format !== 'UNKNOWN') result.format = { value: f.format, provenance: pageText(f.rawText) }
  }
  if (!result.costType) {
    const c = extractCost(text)
    if (c.costType !== 'UNKNOWN') {
      result.costType = { value: c.costType, provenance: pageText(c.rawText) }
      if (c.amount !== null) result.costAmount = { value: c.amount, provenance: pageText(c.rawText) }
      if (c.currency) result.costCurrency = { value: c.currency, provenance: pageText(c.rawText) }
    }
  }
  if (!result.ageRange) {
    const a = extractAgeRange(text)
    if (a) result.ageRange = { value: { min: a.min, max: a.max }, provenance: pageText(a.rawText) }
  }
  for (const r of extractRequirements(text)) {
    result.requirements.push({ value: { label: r.label }, provenance: pageText(r.rawText) })
  }

  result.gaps = computeGaps(result)
  return result
}

/**
 * Adds a dated entry unless the same kind and day is already recorded.
 *
 * Listing pages repeat the same programme across several JSON-LD nodes, which
 * produced the identical start date two or three times over. Showing a student
 * "Programme starts 6 July" three times reads like three separate facts.
 */
function pushDeadline(
  result: ExtractionResult,
  kind: string,
  date: Date,
  provenance: FieldProvenance,
  isRollingAdmission = false,
): void {
  const key = `${kind}:${date.toISOString().slice(0, 10)}`
  const exists = result.deadlines.some(
    (d) => `${d.value.kind}:${d.value.date.toISOString().slice(0, 10)}` === key,
  )
  if (exists) return
  result.deadlines.push({ value: { kind, date, isRollingAdmission }, provenance })
}

/**
 * Maps schema.org attendance vocabulary to a format, or null when the value is
 * outside it. Canonical values are URLs such as
 * https://schema.org/OnlineEventAttendanceMode; bare words are accepted too
 * because publishers commonly write them.
 */
function attendanceMode(raw: string): 'ONLINE' | 'IN_PERSON' | 'HYBRID' | null {
  if (/\b(mixed|hybrid|blended)\b/i.test(raw) || /MixedEventAttendanceMode/i.test(raw)) return 'HYBRID'
  if (/\b(online|virtual|remote|distance)\b/i.test(raw) || /OnlineEventAttendanceMode/i.test(raw)) return 'ONLINE'
  if (/\b(offline|in[-\s]?person|on[-\s]?site|onsite|full[-\s]?time\s+on\s+campus)\b/i.test(raw)) return 'IN_PERSON'
  if (/OfflineEventAttendanceMode/i.test(raw)) return 'IN_PERSON'
  return null
}

/** Fields still missing — the only things the AI stage is ever allowed to touch. */
function computeGaps(r: ExtractionResult): string[] {
  const gaps: string[] = []
  if (!r.title) gaps.push('title')
  if (!r.summary) gaps.push('summary')
  if (!r.organizerName) gaps.push('organizerName')
  if (!r.format) gaps.push('format')
  if (!r.costType) gaps.push('costType')
  if (!r.ageRange) gaps.push('ageRange')
  if (!r.deadlines.some((d) => d.value.kind === 'APPLICATION_DEADLINE')) gaps.push('applicationDeadline')
  if (r.requirements.length === 0) gaps.push('requirements')
  return gaps
}
