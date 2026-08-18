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

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) && v.trim().length > 0 ? n : null
  }
  return null
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

    // Application deadline is published directly by some programme schemas.
    const appDeadline = str(node.applicationDeadline) ?? str(node.applicationStartDate)
    if (appDeadline) {
      const parsed = parseDate(appDeadline)
      if (parsed) {
        result.deadlines.push({
          value: { kind: 'APPLICATION_DEADLINE', date: parsed.date, isRollingAdmission: false },
          provenance: markup(appDeadline),
        })
      }
    }
    for (const [key, kind] of [['startDate', 'PROGRAM_START'], ['endDate', 'PROGRAM_END']] as const) {
      const raw = str(node[key])
      if (!raw) continue
      const parsed = parseDate(raw)
      if (parsed) {
        result.deadlines.push({
          value: { kind, date: parsed.date, isRollingAdmission: false },
          provenance: markup(raw),
        })
      }
    }

    // Attendance mode
    const mode = str(node.courseMode) ?? str(node.eventAttendanceMode)
    if (mode && !result.format) {
      const f = /online|virtual/i.test(mode) ? 'ONLINE' : /mixed|hybrid/i.test(mode) ? 'HYBRID' : 'IN_PERSON'
      result.format = { value: f, provenance: markup(mode) }
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
  if (!result.title) {
    const og = $('meta[property="og:title"]').attr('content') ?? $('title').first().text()
    if (og?.trim()) result.title = { value: og.trim(), provenance: markup(og.trim()) }
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
  if (result.deadlines.length === 0) {
    for (const d of extractDates(text, referenceYear)) {
      result.deadlines.push({
        value: { kind: d.kind, date: d.date, isRollingAdmission: d.isRollingAdmission },
        provenance: pageText(d.rawText),
      })
    }
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
