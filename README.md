# Lumen

A personal opportunity intelligence system for students aged 13–22, worldwide.

> Never miss an opportunity that could matter to your future.

Lumen searches the live web for scholarships, competitions, olympiads, MUNs, research programmes,
internships, summer schools and more; works out which ones a student is **actually eligible** for;
explains **why** each one fits them and what it would cost them in time, money and effort; and then
helps them get the application finished before the deadline.

## Status

**Phase 2–4 complete: architecture, information architecture, data model and design system are
specified and awaiting approval.** No feature code has been written yet — by design. See
[`docs/00-decisions.md`](docs/00-decisions.md) for what has been decided, what has been assumed,
and the four questions still open.

| Doc | Contents |
|---|---|
| [`00-decisions.md`](docs/00-decisions.md) | Decision log — decided / assumed / open |
| [`01-architecture.md`](docs/01-architecture.md) | System design, module layout, failure posture |
| [`02-information-architecture.md`](docs/02-information-architecture.md) | Every screen, navigation, primary journey |
| [`03-design-system.md`](docs/03-design-system.md) | Colour, type, space, components, motion, responsive |
| [`04-data-model.md`](docs/04-data-model.md) | Entities, relationships, deviations from brief |
| [`05-matching-engine.md`](docs/05-matching-engine.md) | Deterministic, explainable scoring |
| [`06-discovery-pipeline.md`](docs/06-discovery-pipeline.md) | Live web search → extraction → corpus |
| [`07-trust-and-provenance.md`](docs/07-trust-and-provenance.md) | Verification states, provenance, what is never generated |
| [`08-deferred.md`](docs/08-deferred.md) | Explicitly out of V1 |

## Principles this codebase holds itself to

1. **Nothing is fabricated.** Deadlines, eligibility, fees and organiser identity are extracted
   verbatim from official sources or left null with an honest "not stated" and a link. There is no
   fallback that guesses.
2. **Every claim is traceable.** Each field records how it was obtained, from where, and when.
3. **The score is not a black box.** Matching is pure, deterministic and unit-tested; every point is
   attributable to a named dimension with the source's own words as evidence.
4. **Missing capability is stated, never simulated.** No API key means an explicit unavailable state,
   never invented results.
5. **Sponsorship can never buy a better match score.** Enforced in the ranking function.

## Required configuration

Lumen needs credentials that must be created by the account owner — they cannot be provisioned on
your behalf. Setup instructions land with the implementation:

| Variable | Purpose | Without it |
|---|---|---|
| `BRAVE_SEARCH_API_KEY` | Live web discovery | Stored corpus only; explicit unavailable state |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google sign-in | Dev-only sign-in, with a production warning |
| `DATABASE_URL` | Postgres (SQLite locally) | — |
| `ANTHROPIC_API_KEY` | Gap-fill extraction, premium advisor | Structured-markup extraction only; advisor off |
