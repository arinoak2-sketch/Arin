# Lumen — Data Model

Deviations from the model list in your brief are marked **[CHANGED]** with a reason.

## Core entities

### User
`id, email, name, image, googleId, role (STUDENT|ADMIN), plan (FREE|PREMIUM), createdAt,
lastActiveAt, deletedAt`
Auth.js owns `Account` and `Session` tables.

### StudentProfile — one per user
```
userId, dateOfBirth (→ age, never stored as a bare number so it can't go stale),
countryCode, region, city (optional, coarse),
educationLevel (MIDDLE|SECONDARY|SENIOR_SECONDARY|UNDERGRAD|GAP_YEAR),
gradeOrYear, curriculum (CBSE|ICSE|IB|IGCSE|A_LEVELS|AP|STATE|OTHER|UNKNOWN),
schoolType, languages[],
formatPreference (ONLINE|IN_PERSON|HYBRID|ANY),
maxTravelRadiusKm?, budgetCeiling? + budgetCurrency,
weeklyHoursAvailable?, availableFrom?, availableUntil?,
targetUniversities[], careerDirections[],
profileCompleteness (derived), visibilityPrefs
```

### Interest / Subject / Skill — shared controlled taxonomy **[CHANGED]**
Your brief listed `Skill` and `Interest` as separate models. They have identical shape and identical
join behaviour, so they are one `Tag` table with a `kind` discriminator
(`SUBJECT|INTEREST|SKILL|CAREER_FIELD`) plus a curated synonym list. One table means one matching
path and one place to fix taxonomy drift, instead of three near-duplicate join tables.

`ProfileTag(profileId, tagId, kind, strength 1–5, evidence?)`
`OpportunityTag(opportunityId, tagId, weight)`

### Achievement
`profileId, kind (COMPETITION|PUBLICATION|LEADERSHIP|SERVICE|CERTIFICATION|PROJECT|SPORT|ARTS),
title, organiser?, level (SCHOOL|LOCAL|NATIONAL|INTERNATIONAL)?, date, description, evidenceUrl?`
Feeds profile strength and eligibility checks ("requires prior research experience").

### Organization
`id, name, canonicalDomain, kind (UNIVERSITY|NGO|GOVERNMENT|COMPANY|FOUNDATION|SCHOOL|UNKNOWN),
country?, verifiedAt?, notes`
Deduped by domain. Never asserted beyond what the source page states.

### Opportunity — the canonical record
```
id, slug, title, summary,
categories[] (many-to-many, extensible — see below),
organizationId?,
format (ONLINE|IN_PERSON|HYBRID|UNKNOWN),
locationCountry?, locationRegion?, locationCity?,
costType (FREE|PAID|FREE_WITH_AID|UNKNOWN), costAmount?, costCurrency?, aidAvailable?,
durationText?, durationDays?,
competitionLevel?  (only when stated by the source; otherwise null)
outcomes[] (CERTIFICATE|AWARD|STIPEND|MENTORSHIP|CREDIT|PUBLICATION|EXPERIENCE)
officialUrl, applyUrl?,
cycleLabel  e.g. "2026",  cycleYear
verificationState (VERIFIED|RECENTLY_VERIFIED|NEEDS_REVIEW|UNVERIFIED|EXPIRED|ARCHIVED)
lastVerifiedAt?, firstSeenAt, lastFetchedAt,
supersedesId?   ← links 2027 cycle to 2026 cycle
fieldProvenance  JSON: per-field {method, sourceUrl, confidence, at}
```

**Categories are rows, not an enum.** `Category(slug, label, parentSlug?, icon, description)`.
Adding "Innovation Challenges" is an insert, not a migration and redeploy — your brief requires
extensibility here.

### OpportunitySource — many per opportunity
`opportunityId, url, domain, isOfficial, discoveredVia (BRAVE|ADMIN|USER_REPORT),
fetchedAt, httpStatus, contentHash, extractionMethod, rawSnapshotRef?`
This is what makes "one canonical opportunity, multiple verified sources" real, and what lets an
admin see exactly where every claim came from.

### EligibilityRule — structured, machine-evaluable
`opportunityId, dimension (AGE|GRADE|EDUCATION_LEVEL|COUNTRY|RESIDENCY|CITIZENSHIP|CURRICULUM|
LANGUAGE|GENDER|SUBJECT_BACKGROUND|PRIOR_EXPERIENCE|FINANCIAL_NEED|SCHOOL_ENROLMENT|OTHER),
operator (BETWEEN|IN|NOT_IN|GTE|LTE|EQUALS|REQUIRES|FREE_TEXT),
value JSON, rawText, provenance, confidence`

`rawText` always keeps the source's exact wording. The UI shows the student the structured verdict
*and* the original sentence, so a mis-parse is visible rather than silently authoritative.

### DeadlineEvent **[CHANGED]**
Your brief had a single `Deadline` model. One date per opportunity cannot express the distinction
your section 8 demands, so this is a typed event table:
`opportunityId, kind (APPLICATION_DEADLINE|EARLY_DEADLINE|REGISTRATION_DEADLINE|DOCUMENT_DEADLINE|
INTERVIEW_WINDOW|PROGRAM_START|PROGRAM_END|RESULT_DATE|NOTIFICATION_DATE),
date, endDate?, timezone?, isRollingAdmission, isEstimated (always false unless stated),
rawText, provenance`
A student can never confuse an application deadline with a programme date, because they are
different rows with different labels and different colours.

### SavedOpportunity
`userId, opportunityId, state (SAVED|CONSIDERING|HIDDEN|NOT_INTERESTED), note?, savedAt`
`HIDDEN`/`NOT_INTERESTED` are negative training signal for ranking.

### Application
`userId, opportunityId, status, customStatusLabel?, startedAt, submittedAt?, decisionAt?,
outcome (ACCEPTED|WAITLISTED|REJECTED|WITHDRAWN|COMPLETED)?, reflection?, readinessScore (derived)`
Status: `SAVED → CONSIDERING → PREPARING → STARTED → SUBMITTED → INTERVIEW →
ACCEPTED|WAITLISTED|REJECTED → COMPLETED`, plus user-defined labels per your section 9.

### ApplicationTask — the checklist
`applicationId, title, kind (ACCOUNT|FORM|TRANSCRIPT|ESSAY|RECOMMENDATION|PORTFOLIO|FEE|
INTERVIEW_PREP|SUBMIT|CUSTOM), isRequired, isComplete, completedAt, dueAt?, leadTimeDays,
blocksSubmission, sortOrder`
Generated from the opportunity's stated requirements. `leadTimeDays` is why a recommendation letter
surfaces weeks early instead of the night before.

### MatchResult — cached, explainable
`userId, opportunityId, score 0–100, computedAt, engineVersion,
reasons JSON[] {dimension, verdict (MATCH|PARTIAL|MISMATCH|UNKNOWN), weight, humanText, evidence}`
Recomputed when the profile changes or the opportunity changes. `engineVersion` means a scoring
change can be rolled out and audited rather than silently rewriting history.

### Verification
`opportunityId, actor (SYSTEM|ADMIN), actorUserId?, action (FETCH_CONFIRMED|FIELD_CORRECTED|
APPROVED|REJECTED|MARKED_EXPIRED|MERGED), fieldsTouched[], note, at`
Append-only audit trail. "Last verified: 18 August 2026" is read from here, never hand-set.

### DiscoveryQuery
`userId?, rawQuery, interpretedFilters JSON, provider, resultCount, latencyMs, at`
Powers the "here's how I interpreted your search, correct me" affordance and the quota budgeting
in Q4. Purged on the retention schedule in Q2.

### Notification / Reminder
`userId, kind, applicationId?, opportunityId?, scheduledFor, sentAt?, channel (IN_APP|EMAIL),
payload JSON, dismissedAt?`
Reminder text is composed from live application state at send time, which is what makes
"due tomorrow **and your personal statement is still incomplete**" possible.

### UserPreference
`userId, notificationChannels, quietHours, digestFrequency, reducedMotion, theme, locale,
excludedCategories[], excludedOrganizations[]`

### Subscription — scaffold only (A5)
`userId, plan, status, startedAt, currentPeriodEnd?, provider (NONE in V1)`
No prices, no payment provider, no checkout. Feature gates read `User.plan`.

## Deferred from V1 (D10)
`Document`, `DocumentShare`, `MentorLink`, `Goal`/`Pathway`, `RoadmapItem` — schema sketched in
`08-deferred.md` so V1 tables don't need reshaping later, but no tables are created yet.
