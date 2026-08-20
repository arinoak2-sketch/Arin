# Lumen — Decision Log

Every entry is either **DECIDED** (you chose it), **ASSUMED** (my default, awaiting your objection),
or **OPEN** (blocking, needs your answer). Nothing is implemented from an OPEN row.

## Decided

| # | Decision | Value | Source |
|---|---|---|---|
| D1 | Product name | **Lumen** | You, discovery round 3 |
| D2 | Audience | Global, ages **13–22** (secondary → undergraduate) | You, round 2 |
| D3 | Data source | **Live web search**, not a hand-curated static database | You, round 1 |
| D4 | Search provider | **Brave Search API** | You, round 2 |
| D5 | Extraction strategy | **Hybrid** — structured markup (JSON-LD/OpenGraph/microdata) parsed deterministically first; AI fills only the gaps; every field records how it was obtained | You, round 2 ("do what's the utmost best") |
| D6 | Persistence | **Live search on every query AND durable storage** of what is found (write-through corpus) | You, round 2 |
| D7 | Authentication | **Google sign-in** | You, round 2 |
| D8 | AI posture | **Deterministic core**; conversational advisor + NL search are a premium layer that degrades cleanly to off | You, round 1 |
| D9 | Visual direction | Optimistic light canvas, emerald accent, spacious, single confident sans; proper dark mode | You, round 3 |
| D10 | V1 scope | **Core loop, done excellently** — profile → discovery → match → detail → save → application + checklist → deadlines/calendar → dashboard, plus admin verification queue | You, round 3 |

## Assumed (tell me if any of these are wrong)

| # | Assumption | Rationale |
|---|---|---|
| A1 | **Next.js 15 (App Router) + TypeScript + Tailwind v4** | Server components let discovery run server-side, which is required — the Brave key must never reach the browser. |
| A2 | **Prisma ORM; SQLite for local dev, Postgres in production** | Same schema both places, one env var to switch. No lock-in to a specific host. |
| A3 | **Auth.js v5 (NextAuth) with the Google provider** | Standard, well-audited implementation of D7. Includes a dev-only email sign-in so the app is testable before you create OAuth credentials. |
| A4 | Deploy target **Vercel**, database on any Postgres host (Neon/Supabase/RDS) | Nothing Vercel-specific in the code; a Dockerfile is provided as an escape hatch. |
| A5 | **Freemium is scaffolded, not sold.** Plan tiers and feature gates exist in the data model; no payment provider is integrated and no prices are shown. | You have not chosen a payment provider or set prices. Inventing prices would be fabrication. |
| A6 | Interface language **English only** in V1, with all user-facing strings centralised so translation is a data task, not a rewrite. | You did not specify languages; hardcoding strings would make this expensive later. |
| A7 | **Document Vault is deferred out of V1** (D10) | Storing minors' identity documents is the single highest-risk surface in this product. It should not ship in a first pass without a settled retention and encryption policy from you. |
| A8 | Minimum age **13** enforced at sign-up; under-13 blocked | COPPA/GDPR-K/DPDP baseline. See OPEN Q3 for what happens for 13–15 year olds in the EU. |

## Resolved since — with what was actually built

All four were answered "defaults are fine". Each is now implemented, so the
answer lives in code rather than in this table.

| # | Question | What shipped |
|---|---|---|
| Q1 | Who verifies opportunities? | Auto-publish only when key fields came from an official domain's own structured markup; everything else is visible but visibly unconfirmed and queued. Nothing reaches `VERIFIED` without a human — `decideVerificationState()` in the pipeline, review queue at `/admin`. |
| Q2 | Data retention | Profile kept until the student deletes it; discovery logs purged at 90 days; sent notifications at 60. One-click delete anonymises the `User` row so audit keys survive without personal data. `lib/jobs/retention.ts`, surfaced on `/admin` so the policy is checkable rather than asserted. |
| Q3 | EU minors | EU residents under 16 are blocked at sign-up, enforced server-side in the profile and onboarding writers rather than in the UI. **The consent flow itself is still not built** — see below. |
| Q4 | Brave API budget | Free tier. Quota is reserved before it is spent, so discovery pauses with a dated message rather than failing mid-session; 12 live searches per student per hour on top, so one account cannot spend everyone's allowance. |

## Still open

| # | Question | Why it is still open |
|---|---|---|
| Q3b | **What counts as verifiable parental consent?** Blocking EU under-16s is a holding position, not a solution. Building the flow needs a decision on the mechanism — email confirmation to a parent, a small verified payment, something else — and each has different legal weight in different member states. | This is the one remaining item with real legal exposure, and it is a product and legal decision rather than an engineering one. |
| Q5 | **Is a paid Brave tier wanted once there are real users?** The free tier is ~2,000 queries a month, which a few dozen active students will exhaust. | Determines whether "live search" stays live at any scale. |

## Q3b resolved — what counts as verifiable parental consent

**Decided: a parent confirms by email, and the account is inert until they do.**

GDPR Art. 8 requires "reasonable efforts" to verify consent, proportionate to the risk. Lumen holds
no payment details and sells nothing, so a confirmation sent to an address the student supplies is
the common reading of proportionate. It is also the weakest of the options considered, and worth
confirming with counsel before a real launch — that caveat is recorded here rather than left implicit.

Rejected alternatives, and why:

| Option | Why not |
|---|---|
| Parent creates the account and invites the student | Strongest evidence, but puts an adult between every 13–15-year-old and sign-up. Most would never return. |
| Keep the blanket block | Zero exposure and zero cost, but it excludes the students who most need a tool like this and cannot pay for alternatives. |
| Build it, enable nothing | Defers the decision without reducing the work. The decision was available; taking it was cheaper than deferring it. |

**The age threshold stays a uniform 16 across the EEA**, not per-country. Member states set it
anywhere from 13 to 16 and several use 13, so this over-blocks real students in those countries —
a deliberate cost. Encoding 27 legal determinations in source means every one of them can be wrong
or go stale, and a wrong value fails in the unsafe direction by admitting an under-age student. A
uniform ceiling errs the other way and asserts nothing about any individual country. `EU_CONSENT_AGE`
in `lib/consent/rules.ts` is the single place to change it once there is advice for a given market.

### What is enforced, and where

- `lib/consent/rules.ts` — pure age and status logic, 26 unit tests. No I/O, because this is the part
  with legal consequences and it should be readable on its own.
- `lib/consent/gate.ts` — called from the `(app)` layout, so it covers every signed-in page including
  ones added later. Also called by the two API routes that act for a student.
- `e2e/parental-consent.spec.ts` — drives it with JavaScript disabled. The load-bearing assertion is
  that a pending account cannot reach the product by typing a URL; without that the flow would be
  decorative.

### Consequences accepted

- **Consent cannot be delivered without a mail provider.** Affected accounts are created and stay
  locked. This is visible in the admin queue rather than silent, but the student waits.
- **No operator can approve on a parent's behalf**, by design — the token is hashed at rest, so it
  cannot be recovered, forwarded, or clicked by whoever runs the server. This costs a manual
  fallback and buys the only thing that makes a recorded consent worth anything.
- **The mail integration is unexercised.** It could not be tested from the environment this was
  built in, which blocks outbound HTTPS to arbitrary hosts. Failures are stored on the consent row
  and surfaced in the admin queue rather than swallowed, so a wrong configuration shows up as an
  undelivered request on first use instead of silently losing emails.
