# Lumen — Live Discovery Pipeline

Implements D3/D4/D5/D6: search the live web every time, and keep what is found.

## The seven stages

**1. Query planning (deterministic).** A student's structured profile plus their filters compose
into a small set of targeted Brave queries — category × subject × level × region — rather than one
vague string. Natural-language input is parsed into the same structured filters and *shown back* to
the student for correction before anything is searched.

**2. Search.** Brave Search API via the `SearchProvider` adapter. Server-side only. Per-user rate
limit and a global monthly budget guard (Q4). Domain quality tiering: `.edu`/`.ac.*`/`.gov`/known
foundation domains rank above aggregators; content farms and scraped-listing mills are down-weighted
by an explicit blocklist, never silently.

**3. Fetch.** `robots.txt` respected before every fetch — non-negotiable, both legally and because
this product's entire claim is trustworthiness. Identifying User-Agent, per-domain concurrency
limit, conditional requests via ETag/Last-Modified, 8s timeout, 2MB cap.

**4. Extract — hybrid (D5).**
   - **4a Structured, deterministic.** JSON-LD (`EducationalOccupationalProgram`, `Course`, `Event`,
     `Scholarship`), microdata, OpenGraph, `<time datetime>`, meta tags. Anything found here is
     high-confidence and machine-attributable.
   - **4b Targeted deterministic parse.** Date, currency and age-range patterns from labelled
     regions of the page ("Deadline:", "Eligibility:"), never from arbitrary prose.
   - **4c AI gap-fill** — only for fields still null, only when a key is configured. The model is
     given the page text and a strict schema, and is instructed to return `null` rather than infer.
     Every returned value must appear verbatim in the source text; a post-check discards any value
     that doesn't. Results are stamped `method: AI_EXTRACTED, confidence: MEDIUM` and never reach
     `VERIFIED` state without human review.

**5. Normalise.** Currencies to ISO codes with the original preserved; dates to UTC with the source
timezone kept; ages/grades to canonical ranges; free text preserved alongside every structured value.

**6. Dedupe.** Layered: exact URL → canonical URL → content hash → `(normalised title, organisation
domain, cycle year)` → title similarity (trigram) above threshold with matching organiser. Matches
merge into one canonical `Opportunity` with an added `OpportunitySource` row. Borderline pairs
(0.75–0.9 similarity) go to an admin merge queue rather than auto-merging — a wrong merge destroys
two listings, a wrong split only annoys.

**7. Provenance stamp + persist.** Write-through to the corpus. See `07-trust-and-provenance.md`.

## How D6 works in practice

Live-search-every-query with nothing stored would make saved opportunities, the tracker and deadline
intelligence impossible, and would burn the API quota in days. So:

1. Corpus results render **immediately** (fast first paint, honest — each card shows when it was
   last fetched).
2. A live Brave search fires in the background for the same query.
3. New or changed results stream in with a "3 new results just found" affordance.
4. Everything found is persisted, deduped against the corpus, and available instantly next time.

The student always sees live web results; they just don't wait on a cold network round-trip to see
anything at all. Every card carries its own freshness stamp, so "stored" never masquerades as "live".

## Recurrence and expiry (your section 30)

A `DeadlineEvent` passing turns the opportunity `EXPIRED` on the next sweep — never silently, and
the old date is never carried forward. When a re-crawl of the same official URL finds a new cycle,
a **new** `Opportunity` row is created with `cycleYear` set and `supersedesId` pointing at the old
one. The 2026 record stays visible and honestly labelled "2026 cycle — closed"; the 2027 record is
its own listing with its own verification history.

## Filling the corpus without a search key

Until `BRAVE_SEARCH_API_KEY` is set there is no live search, and there was no other way in — which
made a paid credential a prerequisite for seeing the product work on a single real opportunity.
That was the wrong dependency to have.

`/admin` now takes a URL. It runs **the same pipeline**, not a shortcut around it:

```
URL → fetchPage (SSRF guard, robots.txt) → extractFromHtml → AI gap-fill → dedupe → persist
```

Supplying a URL asserts nothing about the content. An admin choosing which page to read is not an
admin vouching for what it says, so a manually added record still cannot reach `VERIFIED` without a
separate human review, and every field keeps the provenance the extractor gave it. The only
difference from a search result is `discoveredVia: ADMIN`, and a verification event naming the admin
who added it — because that is what actually happened.

Two things were wrong before this and are fixed: `discoveredVia` was hardcoded to `BRAVE` on both
the create and merge paths, so any non-search source would have been mislabelled; and `ingestHit`
returned a bare string, so a caller could not link to what it had just stored.

### Checking extraction against a page you choose

```bash
PROBE_URL="https://example.edu/summer-programme" npx vitest run e2e/probe
```

Skipped unless `PROBE_URL` is set. It prints every extracted field with its provenance beside it, so
you can compare against the page in your browser and see whether Lumen read it or guessed. This is
the one check a fixture cannot substitute for: the rest of the suite proves the extractor behaves on
HTML written to test it, and this proves it behaves on HTML written by someone else.

Note that a refusal is a valid result. A page Lumen cannot read is declined rather than stored
half-understood.
