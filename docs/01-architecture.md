# Lumen — Technical Architecture

## The shape of the system

Lumen is a Next.js application with three server-side subsystems behind it:
**Discovery** (finds opportunities on the live web), **Intelligence** (scores and explains them
against a student profile, deterministically), and **Workflow** (saves, applications, checklists,
deadlines, reminders).

```
                    ┌──────────────────────────────────────────┐
   Student ────────▶│  Next.js App Router (RSC + Server Actions)│
   (browser)        │  Every secret stays on this side          │
                    └───────────┬──────────────────┬───────────┘
                                │                  │
                   ┌────────────▼────────┐   ┌─────▼──────────────┐
                   │ DISCOVERY PIPELINE  │   │ INTELLIGENCE       │
                   │ 1 query planner     │   │ • match scorer     │
                   │ 2 Brave Search API  │   │ • eligibility eval │
                   │ 3 fetch + parse     │   │ • benefit analysis │
                   │ 4 extract (hybrid)  │   │ • readiness calc   │
                   │ 5 normalise         │   │ • deadline triage  │
                   │ 6 dedupe            │   │  (all pure funcs,  │
                   │ 7 provenance stamp  │   │   no LLM required) │
                   └────────────┬────────┘   └─────┬──────────────┘
                                │                  │
                          ┌─────▼──────────────────▼─────┐
                          │  Postgres (Prisma)           │
                          │  corpus + profiles + apps    │
                          └──────────────────────────────┘
                                │
                   ┌────────────▼─────────────┐
                   │ AI LAYER (premium, opt-in)│
                   │ Claude API — gap-fill     │
                   │ extraction + advisor.     │
                   │ Absent key ⇒ feature off, │
                   │ never degraded silently.  │
                   └───────────────────────────┘
```

## Why server-side

Three non-negotiables force this:

1. The Brave API key and the Anthropic key must never reach a browser. Both are billed per call;
   a leaked key is someone else's bill.
2. Page fetching for extraction is cross-origin. Browsers cannot do it; servers can.
3. Student profile data (age, school, location — minors, globally) must be authorised per request
   against the session, not filtered client-side.

## Module layout

```
app/
  (marketing)/            public landing, how-it-works, trust page
  (app)/
    dashboard/            "what should I do today"
    discover/             feed + search + filters
    opportunity/[id]/     detail page
    applications/         tracker board + per-application checklist
    calendar/             deadline calendar
    profile/              onboarding + edit + strength
    settings/
  (admin)/admin/          verification queue, sources, duplicates, data quality
  api/
    discovery/            server-only route handlers
    cron/                 re-verification + expiry sweeps
lib/
  discovery/              searchProvider.ts (interface) + brave.ts adapter
                          fetcher.ts, extract/structured.ts, extract/ai.ts
                          normalise.ts, dedupe.ts, provenance.ts
  intelligence/           match.ts, eligibility.ts, benefits.ts,
                          readiness.ts, deadlines.ts   ← pure, unit-tested
  ai/                     provider.ts (abstraction), claude.ts, guards.ts
  db/                     prisma client, repositories
  auth/                   Auth.js config, session helpers, role checks
components/
  ui/                     design-system primitives
  opportunity/            cards, match badge, provenance chip, comparison
  application/            status pills, checklist, readiness meter
design/tokens.css         single source of truth for colour/space/type
prisma/schema.prisma
```

## Key architectural rules

- **`lib/intelligence/*` contains no network calls and no LLM calls.** Every function is pure and
  unit-tested. This is what makes match scores explainable and reproducible — the same profile and
  the same opportunity always produce the same score and the same reasons.
- **`lib/ai/*` is always optional.** Every call site checks capability first and has a defined
  non-AI behaviour. There is no code path where a missing key produces a worse-but-unlabelled result.
- **Nothing enters the corpus without provenance.** See `07-trust-and-provenance.md`.
- **No opportunity field is ever invented.** If extraction cannot find a deadline, the field is
  `null` and the UI says "Deadline not stated on the source page" with a link — never a guess.

## Search provider abstraction

```ts
interface SearchProvider {
  name: string
  search(q: SearchQuery): Promise<SearchHit[]>   // title, url, snippet, publishedAt?
  isConfigured(): boolean
}
```

Brave is the V1 adapter (D4). The interface exists so a second provider can be added without
touching the pipeline, not because I plan to ship several.

## Failure posture

| Failure | Behaviour |
|---|---|
| No Brave key configured | Discovery UI shows an explicit "Live discovery is not configured" state with setup link. Stored corpus still browsable. No fake results, ever. |
| Brave returns errors / quota exhausted | Serve corpus, surface a dated banner ("Live results unavailable since 14:20 UTC"), retry with backoff. |
| Page fetch fails or is robots-disallowed | Opportunity is kept with search-result-level data only, flagged `UNVERIFIED`, visibly incomplete. |
| Extraction yields no deadline | Field stays null; card sorts to the bottom of deadline views rather than assuming a date. |
| No Anthropic key | AI advisor and NL search show as unavailable premium features. Gap-fill extraction is skipped; those fields stay null. |
| No Google OAuth credentials | Dev-only credential sign-in is available so the app is testable; a startup warning states clearly that it must not be used in production. |
