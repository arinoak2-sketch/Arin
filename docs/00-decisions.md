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

## Open — I need your answer before these are built

| # | Question | Why it blocks |
|---|---|---|
| Q1 | **Who verifies opportunities?** The admin queue needs a human. Is that you, a team, or should V1 auto-publish anything with a confirmed official source and mark the rest "Needs review"? | Determines whether students see results on day one. |
| Q2 | **Data retention.** How long do we keep a student's profile after they stop using Lumen? My default is: profile retained until the user deletes it, discovery logs purged after 90 days, full export + one-click delete always available. | GDPR/DPDP requirement; affects schema. |
| Q3 | **EU minors.** GDPR Art. 8 requires parental consent below an age that each member state sets between 13 and 16. Options: (a) block EU users under 16, (b) build a parental-consent flow, (c) launch outside the EU first. | Legal exposure. I will not guess this one. |
| Q4 | **Brave API budget.** Free tier is roughly 2,000 queries/month. Live-search-every-query (D6) will exceed that quickly with real users. My plan: serve the stored corpus instantly, fire live search in the background, and rate-limit per user. Confirm that's acceptable, or tell me the paid tier you'd use. | Determines caching aggressiveness and UX latency. |
