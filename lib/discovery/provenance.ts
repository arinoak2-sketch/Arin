import type { Confidence, ProvenanceMethod } from '@/lib/db/enums'

/**
 * Provenance: the record of how Lumen knows each individual field.
 *
 * Nothing enters the corpus without one. It is what lets any value on any
 * screen answer "how do you know that?", and it is what caps an AI-extracted
 * deadline at NEEDS_REVIEW instead of letting it pass as confirmed.
 */

export interface FieldProvenance {
  method: ProvenanceMethod
  sourceUrl: string
  /** The source's exact words. Never paraphrased, never normalised. */
  rawText?: string
  confidence: Confidence
  at: string // ISO 8601
}

export type ProvenanceMap = Record<string, FieldProvenance>

/** A value together with how it was obtained. Values never travel alone. */
export interface Sourced<T> {
  value: T
  provenance: FieldProvenance
}

export const sourced = <T>(value: T, provenance: FieldProvenance): Sourced<T> => ({ value, provenance })

const METHOD_CONFIDENCE: Record<ProvenanceMethod, Confidence> = {
  STRUCTURED_MARKUP: 'HIGH',
  LABELLED_PAGE_TEXT: 'MEDIUM',
  AI_EXTRACTED: 'MEDIUM',
  ADMIN_ENTERED: 'HIGH',
  ADMIN_CORRECTED: 'HIGH',
  USER_REPORTED: 'LOW',
  SEARCH_RESULT: 'LOW',
}

export function makeProvenance(
  method: ProvenanceMethod,
  sourceUrl: string,
  rawText?: string,
  at: Date = new Date(),
): FieldProvenance {
  return { method, sourceUrl, rawText, confidence: METHOD_CONFIDENCE[method], at: at.toISOString() }
}

/**
 * How much a method is trusted when two sources disagree. Note that this ranks
 * *methods*, not outcomes — a conflict is still escalated to review rather than
 * silently resolved; this only decides which value is displayed while it waits.
 */
const METHOD_RANK: Record<ProvenanceMethod, number> = {
  ADMIN_CORRECTED: 6,
  ADMIN_ENTERED: 5,
  STRUCTURED_MARKUP: 4,
  LABELLED_PAGE_TEXT: 3,
  AI_EXTRACTED: 2,
  USER_REPORTED: 1,
  SEARCH_RESULT: 0,
}

export const outranks = (a: ProvenanceMethod, b: ProvenanceMethod): boolean =>
  METHOD_RANK[a] > METHOD_RANK[b]

/** Fields whose value is never generated. See docs/07-trust-and-provenance.md. */
export const NEVER_GENERATED_FIELDS = [
  'applicationDeadline',
  'deadlines',
  'eligibility',
  'costAmount',
  'costType',
  'organizationId',
  'organizerName',
] as const

/**
 * True when a field is critical enough that an AI extraction of it must hold
 * the whole record at NEEDS_REVIEW until a human or structured markup confirms.
 */
export function requiresHumanConfirmation(field: string, method: ProvenanceMethod): boolean {
  if (method !== 'AI_EXTRACTED') return false
  return (NEVER_GENERATED_FIELDS as readonly string[]).some(
    (f) => field === f || field.startsWith(`${f}.`),
  )
}

export interface ConflictReport {
  field: string
  values: Array<{ value: unknown; provenance: FieldProvenance }>
}

/**
 * Merges two provenance maps, preferring the better-attributed method and
 * reporting every genuine disagreement rather than picking a silent winner.
 */
export function mergeProvenance(
  existing: ProvenanceMap,
  incoming: ProvenanceMap,
  valuesEqual: (field: string) => boolean,
): { merged: ProvenanceMap; conflicts: string[] } {
  const merged: ProvenanceMap = { ...existing }
  const conflicts: string[] = []

  for (const [field, next] of Object.entries(incoming)) {
    const current = merged[field]
    if (!current) {
      merged[field] = next
      continue
    }
    if (valuesEqual(field)) {
      // Same answer from a second source: keep the better attribution and
      // treat the agreement as a re-confirmation.
      merged[field] = outranks(next.method, current.method) ? next : { ...current, at: next.at }
      continue
    }
    conflicts.push(field)
    if (outranks(next.method, current.method)) merged[field] = next
  }

  return { merged, conflicts }
}

export const encodeProvenance = (map: ProvenanceMap): string => JSON.stringify(map)

export function decodeProvenance(raw: string | null | undefined): ProvenanceMap {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as ProvenanceMap) : {}
  } catch {
    return {}
  }
}

/** Student-facing wording for each method. Plain language, no jargon. */
export const METHOD_EXPLANATION: Record<ProvenanceMethod, string> = {
  STRUCTURED_MARKUP: 'Published in the page’s own structured data by the organiser.',
  LABELLED_PAGE_TEXT: 'Read from a labelled section of the official page.',
  AI_EXTRACTED: 'Extracted by AI from the page text and not yet confirmed by a person.',
  ADMIN_ENTERED: 'Entered by a Lumen reviewer from the official page.',
  ADMIN_CORRECTED: 'Corrected by a Lumen reviewer after checking the official page.',
  USER_REPORTED: 'Reported by a student and awaiting review.',
  SEARCH_RESULT: 'Taken from a search result, not from the page itself.',
}
