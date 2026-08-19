/**
 * The value sets behind every String column in schema.prisma.
 *
 * SQLite has no native enums, so these are the single source of truth and are
 * enforced by Zod at every write. Keeping them here rather than in the schema
 * also means adding a value is a code change with a type error at every switch
 * that forgot it — which is exactly the review we want.
 */

export const USER_ROLES = ['STUDENT', 'ADMIN'] as const
export const PLANS = ['FREE', 'PREMIUM'] as const

export const EDUCATION_LEVELS = [
  'MIDDLE', 'SECONDARY', 'SENIOR_SECONDARY', 'UNDERGRAD', 'GAP_YEAR',
] as const

export const CURRICULA = [
  'CBSE', 'ICSE', 'IB', 'IGCSE', 'A_LEVELS', 'AP', 'STATE', 'NATIONAL', 'OTHER', 'UNKNOWN',
] as const

export const SCHOOL_TYPES = ['PUBLIC', 'PRIVATE', 'INTERNATIONAL', 'HOMESCHOOL', 'OTHER'] as const

export const FORMATS = ['ONLINE', 'IN_PERSON', 'HYBRID', 'UNKNOWN'] as const
export const FORMAT_PREFERENCES = ['ONLINE', 'IN_PERSON', 'HYBRID', 'ANY'] as const
export const COST_TYPES = ['FREE', 'PAID', 'FREE_WITH_AID', 'UNKNOWN'] as const

export const OUTCOMES = [
  'CERTIFICATE', 'AWARD', 'STIPEND', 'MENTORSHIP', 'CREDIT', 'PUBLICATION', 'EXPERIENCE',
] as const

export const TAG_KINDS = ['SUBJECT', 'INTEREST', 'SKILL', 'CAREER_FIELD'] as const

export const ACHIEVEMENT_KINDS = [
  'COMPETITION', 'PUBLICATION', 'LEADERSHIP', 'SERVICE', 'CERTIFICATION',
  'PROJECT', 'SPORT', 'ARTS',
] as const
export const ACHIEVEMENT_LEVELS = ['SCHOOL', 'LOCAL', 'REGIONAL', 'NATIONAL', 'INTERNATIONAL'] as const

export const VERIFICATION_STATES = [
  'VERIFIED', 'RECENTLY_VERIFIED', 'NEEDS_REVIEW', 'UNVERIFIED', 'EXPIRED', 'ARCHIVED',
] as const

export const VERIFICATION_ACTIONS = [
  'DISCOVERED', 'FETCH_CONFIRMED', 'FIELD_CORRECTED', 'APPROVED', 'REJECTED',
  'MARKED_EXPIRED', 'MERGED', 'REPORTED', 'CYCLE_ROLLED',
] as const

/** How a single field's value was obtained. Never inferred, always recorded. */
export const PROVENANCE_METHODS = [
  'STRUCTURED_MARKUP',   // JSON-LD / microdata / OpenGraph — machine-attributable
  'LABELLED_PAGE_TEXT',  // parsed from a labelled region ("Deadline:")
  'AI_EXTRACTED',        // model-extracted, verbatim-checked, caps state at NEEDS_REVIEW
  'ADMIN_ENTERED',
  'ADMIN_CORRECTED',
  'USER_REPORTED',
  'SEARCH_RESULT',       // title/snippet only — thin
] as const

export const CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW'] as const

export const ELIGIBILITY_DIMENSIONS = [
  'AGE', 'GRADE', 'EDUCATION_LEVEL', 'COUNTRY', 'RESIDENCY', 'CITIZENSHIP',
  'CURRICULUM', 'LANGUAGE', 'GENDER', 'SUBJECT_BACKGROUND', 'PRIOR_EXPERIENCE',
  'FINANCIAL_NEED', 'SCHOOL_ENROLMENT', 'OTHER',
] as const

/**
 * Failing any of these means the student cannot enter at all. They gate; they
 * do not merely subtract points. See docs/05-matching-engine.md.
 */
export const HARD_DIMENSIONS = [
  'AGE', 'GRADE', 'EDUCATION_LEVEL', 'COUNTRY', 'RESIDENCY', 'CITIZENSHIP', 'SCHOOL_ENROLMENT',
] as const

export const ELIGIBILITY_OPERATORS = [
  'BETWEEN', 'IN', 'NOT_IN', 'GTE', 'LTE', 'EQUALS', 'REQUIRES', 'FREE_TEXT',
] as const

export const DEADLINE_KINDS = [
  'APPLICATION_DEADLINE', 'EARLY_DEADLINE', 'REGISTRATION_DEADLINE', 'DOCUMENT_DEADLINE',
  'INTERVIEW_WINDOW', 'APPLICATION_OPENS', 'PROGRAM_START', 'PROGRAM_END', 'RESULT_DATE',
  'NOTIFICATION_DATE',
] as const

/** Human labels. A student must never confuse these two kinds of date. */
export const DEADLINE_LABELS: Record<(typeof DEADLINE_KINDS)[number], string> = {
  APPLICATION_DEADLINE: 'Application deadline',
  EARLY_DEADLINE: 'Early application deadline',
  REGISTRATION_DEADLINE: 'Registration deadline',
  DOCUMENT_DEADLINE: 'Documents due',
  INTERVIEW_WINDOW: 'Interview window',
  APPLICATION_OPENS: 'Applications open',
  PROGRAM_START: 'Programme starts',
  PROGRAM_END: 'Programme ends',
  RESULT_DATE: 'Results announced',
  NOTIFICATION_DATE: 'Decisions notified',
}

/** Only these block an application. Programme dates are not deadlines. */
export const ACTIONABLE_DEADLINE_KINDS = [
  'APPLICATION_DEADLINE', 'EARLY_DEADLINE', 'REGISTRATION_DEADLINE', 'DOCUMENT_DEADLINE',
] as const

export const SAVED_STATES = ['SAVED', 'CONSIDERING', 'HIDDEN', 'NOT_INTERESTED'] as const

export const APPLICATION_STATUSES = [
  'CONSIDERING', 'PREPARING', 'STARTED', 'SUBMITTED', 'INTERVIEW',
  'ACCEPTED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN', 'COMPLETED',
] as const

export const APPLICATION_STATUS_LABELS: Record<(typeof APPLICATION_STATUSES)[number], string> = {
  CONSIDERING: 'Considering',
  PREPARING: 'Preparing',
  STARTED: 'Application started',
  SUBMITTED: 'Submitted',
  INTERVIEW: 'Interview',
  ACCEPTED: 'Accepted',
  WAITLISTED: 'Waitlisted',
  REJECTED: 'Not selected',
  WITHDRAWN: 'Withdrawn',
  COMPLETED: 'Completed',
}

export const TASK_KINDS = [
  'ACCOUNT', 'FORM', 'TRANSCRIPT', 'ESSAY', 'RECOMMENDATION', 'PORTFOLIO',
  'FEE', 'INTERVIEW_PREP', 'IDENTITY', 'SUBMIT', 'CUSTOM',
] as const

/**
 * How many days before a deadline each task type should start screaming.
 * A recommendation letter depends on another human, so it gets three weeks.
 */
export const TASK_LEAD_TIME_DAYS: Record<(typeof TASK_KINDS)[number], number> = {
  RECOMMENDATION: 21,
  TRANSCRIPT: 10,
  PORTFOLIO: 14,
  ESSAY: 10,
  IDENTITY: 7,
  INTERVIEW_PREP: 5,
  FEE: 3,
  FORM: 3,
  ACCOUNT: 2,
  SUBMIT: 1,
  CUSTOM: 3,
}

export const NOTIFICATION_KINDS = [
  'DEADLINE_APPROACHING', 'BLOCKING_TASK_INCOMPLETE', 'LEAD_TIME_WARNING',
  'NEW_MATCHES', 'OPPORTUNITY_CHANGED', 'OPPORTUNITY_EXPIRED', 'PROFILE_NUDGE',
] as const

export type UserRole = (typeof USER_ROLES)[number]
export type Plan = (typeof PLANS)[number]
export type EducationLevel = (typeof EDUCATION_LEVELS)[number]
export type Format = (typeof FORMATS)[number]
export type FormatPreference = (typeof FORMAT_PREFERENCES)[number]
export type CostType = (typeof COST_TYPES)[number]
export type VerificationState = (typeof VERIFICATION_STATES)[number]
export type ProvenanceMethod = (typeof PROVENANCE_METHODS)[number]
export type Confidence = (typeof CONFIDENCE)[number]
export type EligibilityDimension = (typeof ELIGIBILITY_DIMENSIONS)[number]
export type EligibilityOperator = (typeof ELIGIBILITY_OPERATORS)[number]
export type DeadlineKind = (typeof DEADLINE_KINDS)[number]
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]
export type TaskKind = (typeof TASK_KINDS)[number]
export type TagKind = (typeof TAG_KINDS)[number]
export type SavedState = (typeof SAVED_STATES)[number]
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export const isHardDimension = (d: string): boolean =>
  (HARD_DIMENSIONS as readonly string[]).includes(d)

export const isActionableDeadline = (k: string): boolean =>
  (ACTIONABLE_DEADLINE_KINDS as readonly string[]).includes(k)
