# Lumen — Information Architecture (V1)

## Navigation

Desktop: persistent left rail — Dashboard · Discover · Applications · Calendar · Profile.
Mobile: bottom tab bar — Home · Discover · Applications · Calendar, with Profile in the header.
Admin is a separate `/admin` shell, role-gated, never mixed into student nav.

## Screens

### 1. Landing (public)
What Lumen does, how matching works, the trust model stated openly (including what it will not
claim), sign in with Google. No fabricated testimonials, statistics, partner logos, or user counts.

### 2. Onboarding — progressive, 4 short steps, skippable
1. Age + country + education level + grade *(the minimum to match anything at all)*
2. Interests and subjects (tag picker with search)
3. Preferences — format, budget, availability, travel
4. Optional — achievements, target directions
Ends on the dashboard with a real result set, not an empty state. Every step shows what it unlocks
("adding your budget lets Lumen filter out programmes you'd have to withdraw from").

### 3. Dashboard — "what should I do today"
Ordered by urgency, not by section: **Needs action today** → **Deadlines this week** (colour +
icon + text, never colour alone) → **Applications in progress** with next blocking task →
**Top matches for you** (3, with reasons) → **New since you last visited** → **Complete your profile**
(only if it would materially improve matching, with the specific improvement named).
Empty states are useful, not decorative: a new user sees a real next action.

### 4. Discover — feed, search, filters
Natural-language search bar that echoes its interpretation as editable filter chips.
Filter rail: category, age/grade, country, format, cost, deadline window, subject, duration,
organiser type, benefit type, eligibility-only toggle.
Cards: title · organiser · match badge with top reason · deadline chip with urgency · cost · format
· verification state · freshness. Actions: save, hide, not interested, compare, open.
Live-search banner appears while background discovery runs; results stream in.

### 5. Opportunity detail
Header (title, organiser, verification + last-verified date, deadline urgency, match badge) →
**Why this matches you** (reason list with evidence) → **Worth knowing** (partials/mismatches) →
Overview → **Why this could be valuable** (three-tier labelled) → Eligibility (structured verdicts
beside the source's exact wording) → Key dates (typed, never conflated) → Cost → What you'll need →
Application process → Outcomes → Sources (all of them, official marked) → Report a problem.
Sticky action bar: Save · Start application · Compare · Official page.

### 6. Comparison
2–4 opportunities, dimension rows, differences highlighted. On mobile: horizontally scrollable
columns with a frozen label column — not a shrunk table.

### 7. Applications
Board by status (list view on mobile), each card showing readiness % and the single next blocking
task. Detail view: checklist with lead-time warnings, readiness meter with named gaps, key dates,
notes, status history.

### 8. Calendar
Month/week/agenda. Typed events colour-and-icon coded. Personal reminders. iCal export.

### 9. Profile
Editable sections, completeness meter tied to matching impact, strength view framed as
"here's what your profile is strong in and what you might explore" — explicitly never against a
single ideal student.

### 10. Admin
Review queue (newest, lowest-confidence first) · field-by-field confirm/correct against a source
snapshot · merge duplicates · manage categories and source domains · expiry sweep · data-quality
dashboard (coverage per field, AI-extracted share, oldest unverified, reports outstanding).

## Primary journey
Sign in → onboarding (2 min) → dashboard with real matches → open a match → understand why it fits
and what it costs them → save → start application → checklist generated → reminders as the deadline
nears → submit → record outcome.
