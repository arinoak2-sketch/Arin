# Lumen

A personal opportunity intelligence system for students aged 13–22, worldwide.

> Never miss an opportunity that could matter to your future.

Lumen searches the live web for scholarships, competitions, olympiads, MUNs, research programmes,
internships, summer schools and more; works out which ones a student is **actually eligible** for;
explains **why** each one fits them and what it would cost them in time, money and effort; and then
helps them get the application finished before the deadline.

## Status

**The core loop is built, tested and runnable.** Sign in → onboarding → live web discovery →
explained match → opportunity detail → save → application with a generated checklist → deadline
intelligence → calendar → comparison, plus an admin review queue.

**The corpus is empty until you add a Brave Search key.** That is the honest state, not a bug:
Lumen has no bundled directory, and it says so on screen rather than showing invented results.
See [Required configuration](#required-configuration).

```bash
npm install
cp .env.example .env          # SQLite by default — nothing to provision
npx prisma db push && npm run dev
```

| | |
|---|---|
| **Tests** | 146 unit, 28 end-to-end (journey · accessibility · no-JavaScript) |
| **Stack** | Next.js 15 · TypeScript · Prisma · SQLite locally, Postgres in production |
| **Auth** | Google sign-in via Auth.js, with a dev-only fallback that cannot exist in production |

## What is built

| Screen | What it does |
|---|---|
| Landing | How matching works, and what Lumen will not claim |
| Onboarding | Four short steps, each skippable, each naming what it unlocks |
| Dashboard | Ordered by urgency, not by section — answers "what should I do today" |
| Discover | Natural-language search echoed back as editable filter chips |
| Opportunity | Why it matches, what's worth knowing, typed dates, every source listed |
| Comparison | Two to four side by side, only differing rows emphasised |
| Applications | Checklist generated from stated requirements, longest lead time first |
| Calendar | Typed events, iCal export |
| Profile | Completeness tied to matching impact; strength framed as exploration |
| Admin | Review queue, data quality, retention, expiry sweep |

## What is deliberately not built

Document vault, parent/mentor sharing, the AI advisor's chat surface (the grounded provider exists
and is tested; there is no UI), roadmap and goal stacking, achievements, analytics, email digests,
billing. Reasoning in [`docs/08-deferred.md`](docs/08-deferred.md).

The vault is deferred on purpose: it would hold identity documents belonging to minors, and it
should not ship before encryption, retention and jurisdiction are settled.

## The five things this codebase holds itself to

1. **Nothing is fabricated.** Deadlines, eligibility, fees and organiser identity are extracted
   verbatim or left null with an honest "not stated" and a link. There is no fallback that guesses,
   and ambiguous dates like `09/12/2026` are refused rather than resolved by convention.
2. **Every claim is traceable.** Each field records how it was obtained, from where, and when.
   Anything AI-extracted stays visibly unconfirmed and cannot reach "verified" without a human.
3. **The score is not a black box.** Matching is pure, deterministic and unit-tested. Unknown
   dimensions leave the denominator rather than counting against a listing, and ineligible
   opportunities are gated with a reason rather than scored low and buried.
4. **Missing capability is stated, never simulated.** No API key means an explicit unavailable
   state, never invented results.
5. **Sponsorship can never buy a better match score.** Enforced in the ranking function.

## Required configuration

None of these can be provisioned on your behalf — each needs your identity and billing consent.
Step-by-step in [`docs/09-running-lumen.md`](docs/09-running-lumen.md).

| Variable | Purpose | Without it |
|---|---|---|
| `BRAVE_SEARCH_API_KEY` | Live web discovery | Stored corpus only, with an explicit on-screen notice |
| `AUTH_GOOGLE_ID` / `_SECRET` | Google sign-in | Dev-only sign-in, refused in production |
| `AUTH_SECRET` | Session signing | Production refuses to start |
| `DATABASE_URL` | Postgres in production | SQLite locally |
| `ANTHROPIC_API_KEY` | Gap-fill extraction, advisor | Structured-markup extraction only; advisor off |
| `CRON_SECRET` | Scheduled expiry + retention purge | Maintenance route refuses every request |

## Documentation

| Doc | Contents |
|---|---|
| [`00-decisions.md`](docs/00-decisions.md) | Decision log — decided, assumed, and what is still open |
| [`01-architecture.md`](docs/01-architecture.md) | System design, module layout, failure posture |
| [`02-information-architecture.md`](docs/02-information-architecture.md) | Every screen, navigation, primary journey |
| [`03-design-system.md`](docs/03-design-system.md) | Colour, type, motion, and the rules testing produced |
| [`04-data-model.md`](docs/04-data-model.md) | Entities, relationships, deviations from the brief |
| [`05-matching-engine.md`](docs/05-matching-engine.md) | Deterministic, explainable scoring |
| [`06-discovery-pipeline.md`](docs/06-discovery-pipeline.md) | Live web search → extraction → corpus |
| [`07-trust-and-provenance.md`](docs/07-trust-and-provenance.md) | Verification states, and what is never generated |
| [`08-deferred.md`](docs/08-deferred.md) | Explicitly out of V1 |
| [`09-running-lumen.md`](docs/09-running-lumen.md) | Setup, credentials, scheduled work, testing |
| [`10-security.md`](docs/10-security.md) | Security review: findings, fixes, accepted risks |

## Still open

- **The EU age gate is a blunt block, not a consent flow.** EU residents under 16 cannot sign up.
  GDPR Art. 8 needs verifiable parental consent, and what counts as verifiable is a decision for
  the operator. This is the one item with real legal exposure.
- **Nothing schedules the maintenance route** on a non-Vercel deployment. `vercel.json` wires it;
  elsewhere it needs a cron entry.
- **Rate limits are database-backed counts**, so they are approximate across multiple instances.
