import { TASK_LEAD_TIME_DAYS, type TaskKind } from '@/lib/db/enums'
import { daysBetween } from './deadlines'

/**
 * Turns an opportunity's stated requirements into an application checklist.
 *
 * The point of the lead time is the recommendation letter: it depends on
 * another human replying, so it must surface three weeks out, not the night
 * before. A checklist that only tells you what's left is a to-do list; one
 * that tells you what's *already late* is worth opening.
 */

export interface RequirementInput {
  kind?: string
  label: string
  rawText?: string | null
}

export interface GeneratedTask {
  title: string
  detail?: string
  kind: TaskKind
  isRequired: boolean
  blocksSubmission: boolean
  leadTimeDays: number
  sortOrder: number
}

/** Maps free-text requirement wording onto a task kind. Conservative by design. */
const KIND_PATTERNS: Array<[TaskKind, RegExp]> = [
  ['RECOMMENDATION', /\b(recommendation|reference|referee|letter of support|nomination)\b/i],
  ['TRANSCRIPT', /\b(transcript|report card|academic record|mark ?sheet|grades?)\b/i],
  ['ESSAY', /\b(essay|personal statement|statement of purpose|motivation letter|cover letter|written response)\b/i],
  ['PORTFOLIO', /\b(portfolio|showreel|sample work|writing sample|audition|demo)\b/i],
  ['IDENTITY', /\b(passport|identity|id proof|birth certificate|photo id)\b/i],
  ['FEE', /\b(fee|payment|pay |registration cost|application charge)\b/i],
  ['INTERVIEW_PREP', /\b(interview|viva|selection round)\b/i],
  ['ACCOUNT', /\b(account|register|sign ?up|create a profile)\b/i],
  ['FORM', /\b(form|application form|questionnaire|details)\b/i],
]

export function classifyRequirement(text: string): TaskKind {
  for (const [kind, re] of KIND_PATTERNS) if (re.test(text)) return kind
  return 'CUSTOM'
}

/** Tasks every application needs, regardless of what the source page lists. */
const BASE_TASKS: Array<Omit<GeneratedTask, 'sortOrder'>> = [
  {
    title: 'Read the official page in full',
    detail: 'Lumen extracts what it can, but the organiser’s page is the authority.',
    kind: 'CUSTOM',
    isRequired: true,
    blocksSubmission: false,
    leadTimeDays: 1,
  },
  {
    title: 'Create an account with the organiser',
    kind: 'ACCOUNT',
    isRequired: true,
    blocksSubmission: true,
    leadTimeDays: TASK_LEAD_TIME_DAYS.ACCOUNT,
  },
  {
    title: 'Complete the application form',
    kind: 'FORM',
    isRequired: true,
    blocksSubmission: true,
    leadTimeDays: TASK_LEAD_TIME_DAYS.FORM,
  },
]

const SUBMIT_TASK: Omit<GeneratedTask, 'sortOrder'> = {
  title: 'Submit the application',
  kind: 'SUBMIT',
  isRequired: true,
  blocksSubmission: true,
  leadTimeDays: TASK_LEAD_TIME_DAYS.SUBMIT,
}

/**
 * Ordered so the longest lead times come first: a student scanning the list
 * top-to-bottom meets the thing that takes three weeks before the thing that
 * takes ten minutes.
 */
export function buildChecklist(requirements: RequirementInput[]): GeneratedTask[] {
  const seen = new Set<TaskKind>()
  const derived: Array<Omit<GeneratedTask, 'sortOrder'>> = []

  for (const req of requirements) {
    const kind = (req.kind as TaskKind | undefined) ?? classifyRequirement(req.label)
    // One task per kind: three phrasings of "upload your transcript" is one job.
    if (kind !== 'CUSTOM' && seen.has(kind)) continue
    seen.add(kind)
    derived.push({
      title: req.label,
      detail: req.rawText ?? undefined,
      kind,
      isRequired: true,
      blocksSubmission: kind !== 'INTERVIEW_PREP',
      leadTimeDays: TASK_LEAD_TIME_DAYS[kind],
    })
  }

  const base = BASE_TASKS.filter((t) => !seen.has(t.kind) || t.kind === 'CUSTOM')
  const all = [...base, ...derived, SUBMIT_TASK]

  return all
    .sort((a, b) => {
      if (a.kind === 'SUBMIT') return 1
      if (b.kind === 'SUBMIT') return -1
      return b.leadTimeDays - a.leadTimeDays
    })
    .map((t, i) => ({ ...t, sortOrder: i }))
}

export interface TaskUrgency {
  /** True when the deadline is closer than this task's lead time. */
  isBehind: boolean
  /** Days of slack left before this task becomes the bottleneck. Negative = late. */
  slackDays: number
  message?: string
}

/**
 * Answers "should I be worried about this task yet?" — the difference between
 * a checklist and a plan.
 */
export function taskUrgency(
  // Deliberately accepts a plain `kind` string: callers pass rows straight from
  // the database, where the value set is enforced on write rather than by type.
  task: { kind: string; leadTimeDays: number; title: string; isComplete?: boolean },
  deadline: Date | null,
  now: Date = new Date(),
): TaskUrgency {
  if (task.isComplete || !deadline) return { isBehind: false, slackDays: Number.POSITIVE_INFINITY }
  const daysLeft = daysBetween(deadline, now)
  const slackDays = daysLeft - task.leadTimeDays
  if (slackDays >= 0) return { isBehind: false, slackDays }

  const message =
    task.kind === 'RECOMMENDATION'
      ? `This usually needs about ${task.leadTimeDays} days because it depends on someone else replying. The deadline is in ${daysLeft} days — ask now.`
      : `This normally takes around ${task.leadTimeDays} days and the deadline is in ${daysLeft}.`

  return { isBehind: true, slackDays, message }
}
