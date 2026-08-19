import { DEADLINE_LABELS, isActionableDeadline, type DeadlineKind } from '@/lib/db/enums'

/**
 * Deadline triage.
 *
 * Two rules this module exists to enforce:
 *   1. An application deadline and a programme date are never treated as the
 *      same thing. Only actionable kinds create urgency.
 *   2. Urgency is never expressed as a colour alone. Every level carries a
 *      label and a shape name so the UI can render text, icon and colour
 *      together — see docs/03-design-system.md.
 */

export type Urgency = 'PASSED' | 'URGENT' | 'SOON' | 'UPCOMING' | 'CALM'

export interface UrgencyBand {
  level: Urgency
  /** Token suffix: var(--deadline-urgent) etc. */
  token: string
  /** Screen-reader and visual label. Never colour alone. */
  label: string
  shape: 'alert' | 'warning' | 'clock' | 'calendar' | 'archive'
}

const BANDS: Record<Urgency, UrgencyBand> = {
  PASSED: { level: 'PASSED', token: 'passed', label: 'Closed', shape: 'archive' },
  URGENT: { level: 'URGENT', token: 'urgent', label: 'Due very soon', shape: 'alert' },
  SOON: { level: 'SOON', token: 'soon', label: 'Due this week', shape: 'warning' },
  UPCOMING: { level: 'UPCOMING', token: 'upcoming', label: 'Coming up', shape: 'clock' },
  CALM: { level: 'CALM', token: 'calm', label: 'Plenty of time', shape: 'calendar' },
}

const DAY_MS = 86_400_000

/** Whole days between now and `date`, floored — 23 hours away is "in 0 days", i.e. today. */
export function daysBetween(date: Date, now: Date): number {
  return Math.floor((date.getTime() - now.getTime()) / DAY_MS)
}

export function urgencyOf(date: Date, now: Date = new Date()): UrgencyBand {
  const days = daysBetween(date, now)
  if (days < 0) return BANDS.PASSED
  if (days <= 3) return BANDS.URGENT
  if (days <= 7) return BANDS.SOON
  if (days <= 21) return BANDS.UPCOMING
  return BANDS.CALM
}

/**
 * "Due in 5 days" / "Due today" / "Closed 3 days ago" — always words, never
 * just a colour.
 *
 * Deadline wording only. A date the student cannot miss is not "due" and does
 * not "close", so non-actionable kinds go through neutralCountdownText via
 * countdownFor.
 */
export function countdownText(date: Date, now: Date = new Date()): string {
  const days = daysBetween(date, now)
  if (days < -1) return `Closed ${Math.abs(days)} days ago`
  if (days < 0) return 'Closed yesterday'
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days <= 27) return `Due in ${days} days`
  const weeks = Math.round(days / 7)
  if (weeks < 9) return `Due in ${weeks} weeks`
  return `Due in ${Math.round(days / 30)} months`
}

/**
 * The same interval said without implying an obligation: "in 5 days", "2 days
 * ago". Used for programme dates, results and the day applications open.
 */
export function neutralCountdownText(date: Date, now: Date = new Date()): string {
  const days = daysBetween(date, now)
  if (days < -1) return `${Math.abs(days)} days ago`
  if (days < 0) return 'Yesterday'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 27) return `In ${days} days`
  const weeks = Math.round(days / 7)
  if (weeks < 9) return `In ${weeks} weeks`
  return `In ${Math.round(days / 30)} months`
}

/**
 * Picks the wording for a kind.
 *
 * Applying deadline language to every date produced statements that were
 * simply false: "Results announced · Closed 3 days ago" (they were announced,
 * not closed) and, worst of all, "Applications open · Closed 2 days ago" —
 * which tells a student a programme is shut on the evidence that it opened.
 */
export const countdownFor = (kind: string, date: Date, now: Date = new Date()): string =>
  isActionableDeadline(kind) ? countdownText(date, now) : neutralCountdownText(date, now)

/**
 * The urgency band, adjusted for kinds that cannot expire.
 *
 * A past programme start is not "Closed" — the programme is running, or has
 * run. Only a missed actionable deadline closes anything.
 */
export function bandFor(kind: string, date: Date, now: Date = new Date()): UrgencyBand {
  const band = urgencyOf(date, now)
  if (band.level !== 'PASSED' || isActionableDeadline(kind)) return band
  return { ...band, label: kind === 'APPLICATION_OPENS' ? 'Open now' : 'Already happened' }
}

export interface TriagedDeadline {
  kind: DeadlineKind
  label: string
  date: Date
  endDate?: Date | null
  urgency: UrgencyBand
  countdown: string
  /** True only for kinds a student must act on — never programme dates. */
  actionable: boolean
  isRollingAdmission: boolean
  isEstimated: boolean
  rawText?: string | null
}

export function triage(
  deadlines: Array<{
    kind: string
    date: Date
    endDate?: Date | null
    isRollingAdmission?: boolean
    isEstimated?: boolean
    rawText?: string | null
  }>,
  now: Date = new Date(),
): TriagedDeadline[] {
  return deadlines
    .map((d) => ({
      kind: d.kind as DeadlineKind,
      label: DEADLINE_LABELS[d.kind as DeadlineKind] ?? d.kind,
      date: d.date,
      endDate: d.endDate ?? null,
      urgency: bandFor(d.kind, d.date, now),
      countdown: countdownFor(d.kind, d.date, now),
      actionable: isActionableDeadline(d.kind),
      isRollingAdmission: d.isRollingAdmission ?? false,
      isEstimated: d.isEstimated ?? false,
      rawText: d.rawText ?? null,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** The one date a dashboard should lead with for this opportunity. */
export function primaryDeadline(all: TriagedDeadline[]): TriagedDeadline | undefined {
  const open = all.filter((d) => d.actionable && d.urgency.level !== 'PASSED')
  return open[0] ?? all.find((d) => d.actionable)
}

export interface DeadlineBucket {
  key: Urgency
  band: UrgencyBand
  items: TriagedDeadline[]
}

/** Groups for the dashboard: "3 applications due this week", then by band. */
export function bucketByUrgency(items: TriagedDeadline[]): DeadlineBucket[] {
  const order: Urgency[] = ['URGENT', 'SOON', 'UPCOMING', 'CALM', 'PASSED']
  return order
    .map((key) => ({ key, band: BANDS[key], items: items.filter((i) => i.urgency.level === key) }))
    .filter((b) => b.items.length > 0)
}

export function countDueWithin(items: TriagedDeadline[], days: number, now: Date = new Date()): number {
  return items.filter((i) => {
    if (!i.actionable) return false
    const d = daysBetween(i.date, now)
    return d >= 0 && d <= days
  }).length
}
