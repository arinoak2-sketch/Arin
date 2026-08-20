import 'server-only'
import { callStructured, isAvailable } from '@/lib/ai/provider'
import { makeProvenance } from '../provenance'
import { parseDate } from './patterns'
import type { ExtractionResult } from './structured'

/**
 * Stage 4c: AI gap-fill.
 *
 * Runs only on fields that structured markup and labelled-text parsing both
 * failed to produce, and only when a key is configured. Three guards make its
 * output safe to store:
 *
 *   1. The model is told to return null rather than infer. Extraction, not
 *      reasoning about what a programme is probably like.
 *   2. Every returned value must appear VERBATIM in the source text. Anything
 *      that doesn't is discarded before it reaches the corpus — this is the
 *      check that stops a plausible-sounding deadline from being invented.
 *   3. Everything that survives is stamped AI_EXTRACTED, which caps the record
 *      at NEEDS_REVIEW for any of the never-generated fields.
 */

interface AiExtraction {
  title: string | null
  summary: string | null
  organizerName: string | null
  format: 'ONLINE' | 'IN_PERSON' | 'HYBRID' | null
  applicationDeadlineText: string | null
  ageMin: number | null
  ageMax: number | null
  ageRangeText: string | null
  costText: string | null
  requirements: string[]
  statedBenefits: string[]
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: ['string', 'null'], description: 'The opportunity name exactly as written on the page.' },
    summary: { type: ['string', 'null'], description: 'One or two sentences taken from the page describing what it is.' },
    organizerName: { type: ['string', 'null'], description: 'The organisation running it, exactly as named on the page.' },
    format: { type: ['string', 'null'], enum: ['ONLINE', 'IN_PERSON', 'HYBRID', null] },
    applicationDeadlineText: {
      type: ['string', 'null'],
      description:
        'The exact sentence or phrase stating the APPLICATION deadline, copied verbatim. Null if the page states no application deadline, or only states programme dates.',
    },
    ageMin: { type: ['integer', 'null'] },
    ageMax: { type: ['integer', 'null'] },
    ageRangeText: { type: ['string', 'null'], description: 'The exact phrase stating the age requirement, copied verbatim.' },
    costText: { type: ['string', 'null'], description: 'The exact phrase stating the cost or fee, copied verbatim.' },
    requirements: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exact phrases naming what an applicant must submit. Empty array if the page does not say.',
    },
    statedBenefits: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exact phrases in which the organiser states what participants receive. Empty array if none.',
    },
  },
  required: [
    'title', 'summary', 'organizerName', 'format', 'applicationDeadlineText',
    'ageMin', 'ageMax', 'ageRangeText', 'costText', 'requirements', 'statedBenefits',
  ],
} as const

const SYSTEM = [
  'You extract structured facts from a web page about a student opportunity.',
  '',
  'You are a transcriber, not an analyst. Copy what the page says; do not infer, summarise into new wording, or fill from general knowledge.',
  '',
  'Rules:',
  '- Every text field you return must appear verbatim in the page text. If you cannot copy it, return null.',
  '- Return null rather than guessing. A null is correct and useful; a plausible guess is harmful.',
  '- Never convert or reformat a date. Copy the phrase as written.',
  '- Do not treat a programme start date, an event date or a results date as an application deadline.',
  '- Do not treat a prize, an award value or a stipend as a fee.',
  '- If the page is not about a specific student opportunity, return null for every field and empty arrays.',
].join('\n')

/**
 * Normalises for the verbatim check: case, whitespace and quote style only.
 *
 * Straight quotes fold to curly ones as well as the reverse. A page that
 * publishes a typographic quotation mark and a model that copies it as a plain
 * one are saying the same thing, and rejecting that as "not verbatim" throws
 * away a true value — the check exists to catch invention, not typography.
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/["‘’“”]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The guard that makes AI extraction storable: it must be in the source text. */
export function appearsVerbatim(value: string, sourceText: string): boolean {
  const v = normalise(value)
  if (v.length < 3) return false
  return normalise(sourceText).includes(v)
}

function validate(raw: unknown): AiExtraction | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const s = (k: string): string | null => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string).trim() : null)
  const n = (k: string): number | null => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : null)
  const arr = (k: string): string[] =>
    Array.isArray(o[k]) ? (o[k] as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []

  const format = s('format')
  return {
    title: s('title'),
    summary: s('summary'),
    organizerName: s('organizerName'),
    format: format === 'ONLINE' || format === 'IN_PERSON' || format === 'HYBRID' ? format : null,
    applicationDeadlineText: s('applicationDeadlineText'),
    ageMin: n('ageMin'),
    ageMax: n('ageMax'),
    ageRangeText: s('ageRangeText'),
    costText: s('costText'),
    requirements: arr('requirements'),
    statedBenefits: arr('statedBenefits'),
  }
}

export interface AiFillReport {
  attempted: boolean
  filled: string[]
  /** Values the model returned that were NOT in the source text, and were dropped. */
  rejected: string[]
}

/**
 * Fills gaps in an extraction result in place, returning what it did.
 * Existing values are never overwritten: markup always beats the model.
 */
export async function fillGapsWithAi(
  result: ExtractionResult,
  url: string,
  fetchedAt: Date = new Date(),
): Promise<AiFillReport> {
  const report: AiFillReport = { attempted: false, filled: [], rejected: [] }
  if (!isAvailable() || result.gaps.length === 0 || result.text.length < 200) return report

  report.attempted = true
  const pageText = result.text.slice(0, 24_000)

  const extracted = await callStructured<AiExtraction>({
    system: SYSTEM,
    userContent: `PAGE URL: ${url}\n\nPAGE TEXT:\n${pageText}`,
    toolName: 'record_extraction',
    toolDescription: 'Record the facts stated on this page about a student opportunity.',
    schema: SCHEMA as unknown as Record<string, unknown>,
    validate,
    effort: 'low',
  })
  if (!extracted) return report

  const stamp = (rawText: string) => makeProvenance('AI_EXTRACTED', url, rawText, fetchedAt)

  /*
   * Returns the value only if the page really contains it.
   *
   * Deliberately does NOT record the field as filled: several callers below
   * quote a phrase successfully and then still discard it, because a second
   * deterministic check fails. Counting at this point made the audit note on
   * the record ("AI filled N fields") claim work that never happened. Filling
   * is recorded where a value is actually stored, and nowhere else.
   */
  const quoted = (field: string, value: string | null): string | null => {
    if (!value) return null
    if (!appearsVerbatim(value, result.text)) {
      report.rejected.push(`${field}: ${value.slice(0, 80)}`)
      return null
    }
    return value
  }

  if (!result.title) {
    const v = quoted('title', extracted.title)
    if (v) {
      result.title = { value: v, provenance: stamp(v) }
      report.filled.push('title')
    }
  }
  if (!result.summary) {
    const v = quoted('summary', extracted.summary)
    if (v) {
      result.summary = { value: v, provenance: stamp(v) }
      report.filled.push('summary')
    }
  }
  if (!result.organizerName) {
    const v = quoted('organizerName', extracted.organizerName)
    if (v) {
      result.organizerName = { value: v, provenance: stamp(v) }
      report.filled.push('organizerName')
    }
  }
  if (!result.format && extracted.format) {
    // Format is a classification rather than a quotation, so there is nothing
    // to check verbatim. It is low-stakes and never gates eligibility.
    result.format = { value: extracted.format, provenance: stamp(`format: ${extracted.format}`) }
    report.filled.push('format')
  }

  // The deadline is the highest-stakes field on the page, so it must survive
  // BOTH the verbatim check and a re-parse by the deterministic date parser.
  // The model never supplies the date itself — only the sentence it lives in.
  if (!result.deadlines.some((d) => d.value.kind === 'APPLICATION_DEADLINE')) {
    const sentence = quoted('applicationDeadline', extracted.applicationDeadlineText)
    if (sentence) {
      const parsed = parseDate(sentence, fetchedAt.getUTCFullYear())
      if (parsed) {
        result.deadlines.push({
          value: { kind: 'APPLICATION_DEADLINE', date: parsed.date, isRollingAdmission: false },
          provenance: stamp(sentence),
        })
        report.filled.push('applicationDeadline')
      } else {
        report.rejected.push(`applicationDeadline: unparseable — ${sentence.slice(0, 80)}`)
      }
    }
  }

  if (!result.ageRange && extracted.ageRangeText) {
    const phrase = quoted('ageRange', extracted.ageRangeText)
    if (phrase && (extracted.ageMin !== null || extracted.ageMax !== null)) {
      result.ageRange = {
        value: { min: extracted.ageMin, max: extracted.ageMax },
        provenance: stamp(phrase),
      }
      report.filled.push('ageRange')
    }
  }

  if (!result.costType && extracted.costText) {
    const phrase = quoted('cost', extracted.costText)
    if (phrase) {
      // Only the wording is taken from the model; the value is re-derived by
      // the deterministic parser so a hallucinated number cannot get through.
      const { extractCost } = await import('./patterns')
      const parsed = extractCost(phrase)
      if (parsed.costType !== 'UNKNOWN') {
        result.costType = { value: parsed.costType, provenance: stamp(phrase) }
        if (parsed.amount !== null) result.costAmount = { value: parsed.amount, provenance: stamp(phrase) }
        if (parsed.currency) result.costCurrency = { value: parsed.currency, provenance: stamp(phrase) }
        report.filled.push('cost')
      }
    }
  }

  if (result.requirements.length === 0) {
    for (const req of extracted.requirements.slice(0, 10)) {
      if (!appearsVerbatim(req, result.text)) {
        report.rejected.push(`requirement: ${req.slice(0, 60)}`)
        continue
      }
      result.requirements.push({ value: { label: req }, provenance: stamp(req) })
      report.filled.push('requirement')
    }
  }

  for (const benefit of extracted.statedBenefits.slice(0, 8)) {
    if (!appearsVerbatim(benefit, result.text)) {
      report.rejected.push(`benefit: ${benefit.slice(0, 60)}`)
      continue
    }
    result.statedBenefits.push({ value: { label: benefit }, provenance: stamp(benefit) })
    report.filled.push('benefit')
  }

  return report
}
