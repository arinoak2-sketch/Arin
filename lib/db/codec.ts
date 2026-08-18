/**
 * Typed access to the JSON-in-String columns the SQLite/Postgres portability
 * choice requires. Every decode is total: a malformed value yields the fallback
 * rather than throwing, because one bad row must not take down a page.
 */

export function decodeStringArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function decodeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed === null || parsed === undefined ? fallback : (parsed as T)
  } catch {
    return fallback
  }
}

export const encodeJson = (value: unknown): string => JSON.stringify(value)

export interface RequirementRecord {
  kind?: string
  label: string
  rawText?: string
}

export interface StatedBenefitRecord {
  label: string
  rawText?: string
  sourceUrl?: string
}

export const decodeRequirements = (raw: string | null | undefined): RequirementRecord[] =>
  decodeJson<RequirementRecord[]>(raw, []).filter((r) => typeof r?.label === 'string')

export const decodeStatedBenefits = (raw: string | null | undefined): StatedBenefitRecord[] =>
  decodeJson<StatedBenefitRecord[]>(raw, []).filter((b) => typeof b?.label === 'string')

/** URL-safe, human-readable, collision-resistant slug for an opportunity. */
export function slugify(title: string, suffix: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `${base || 'opportunity'}-${suffix.slice(0, 6)}`
}
