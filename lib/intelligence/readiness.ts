import { taskUrgency } from './checklist'
import { daysBetween } from './deadlines'

/**
 * Application readiness.
 *
 * The number matters less than the sentence beside it. A student who sees
 * "72% ready" learns nothing; one who sees "72% — your personal statement is
 * the only thing blocking submission" knows what to do in the next hour.
 * So `nextAction` is the real output and the percentage is the summary.
 */

export interface ReadinessTask {
  id: string
  title: string
  kind: string
  isRequired: boolean
  isComplete: boolean
  blocksSubmission: boolean
  leadTimeDays: number
}

export interface ReadinessOutcome {
  /** 0–100, over required tasks only. Optional extras never dilute it. */
  score: number
  completed: number
  total: number
  /** The single thing to do next, chosen by what blocks submission soonest. */
  nextAction: ReadinessTask | null
  /** Required, incomplete, and already past their comfortable start date. */
  behindSchedule: Array<ReadinessTask & { message: string }>
  blockers: ReadinessTask[]
  canSubmit: boolean
}

export function computeReadiness(
  tasks: ReadinessTask[],
  deadline: Date | null,
  now: Date = new Date(),
): ReadinessOutcome {
  const required = tasks.filter((t) => t.isRequired)
  const completed = required.filter((t) => t.isComplete)
  const score = required.length === 0 ? 0 : Math.round((completed.length / required.length) * 100)

  const blockers = required.filter((t) => !t.isComplete && t.blocksSubmission)

  const behindSchedule = required
    .filter((t) => !t.isComplete)
    .map((t) => ({ task: t, urgency: taskUrgency(t, deadline, now) }))
    .filter((x) => x.urgency.isBehind)
    .map((x) => ({ ...x.task, message: x.urgency.message ?? 'This needs starting now.' }))

  // Priority: something already late, then whatever blocks submission, then
  // anything else outstanding. Longest lead time breaks ties.
  const nextAction =
    behindSchedule[0] ??
    [...blockers].sort((a, b) => b.leadTimeDays - a.leadTimeDays)[0] ??
    required.find((t) => !t.isComplete) ??
    null

  return {
    score,
    completed: completed.length,
    total: required.length,
    nextAction: nextAction ? stripMessage(nextAction) : null,
    behindSchedule,
    blockers,
    canSubmit: blockers.length === 0 && required.length > 0,
  }
}

function stripMessage(t: ReadinessTask & { message?: string }): ReadinessTask {
  const { message: _message, ...rest } = t
  return rest
}

/**
 * The reminder sentence. This is the whole reason Lumen sends notifications at
 * all: "Deadline tomorrow" is something a calendar already does. Naming the
 * unfinished thing is what makes the reminder worth the interruption.
 */
export function reminderText(
  opportunityTitle: string,
  readiness: ReadinessOutcome,
  deadline: Date | null,
  now: Date = new Date(),
): string | null {
  if (!deadline) return null
  const days = daysBetween(deadline, now)
  if (days < 0) return null

  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`

  if (readiness.behindSchedule.length > 0) {
    const t = readiness.behindSchedule[0]!
    return `${opportunityTitle} is due ${when}, and ${lower(t.title)} usually takes longer than the time you have left.`
  }
  if (readiness.blockers.length === 1) {
    return `${opportunityTitle} is due ${when}, and ${lower(readiness.blockers[0]!.title)} is the only thing left before you can submit.`
  }
  if (readiness.blockers.length > 1) {
    return `${opportunityTitle} is due ${when}, with ${readiness.blockers.length} things still outstanding — starting with ${lower(readiness.blockers[0]!.title)}.`
  }
  return `${opportunityTitle} is due ${when} and everything on your checklist is done. Submit when you're ready.`
}

const lower = (s: string): string => (s.length > 0 ? s.charAt(0).toLowerCase() + s.slice(1) : s)
