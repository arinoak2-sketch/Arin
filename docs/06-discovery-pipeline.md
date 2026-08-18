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
