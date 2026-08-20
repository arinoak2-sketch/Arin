# Lumen — Trust, Provenance & Verification

The product promise is "never miss an opportunity that could matter". A student acting on a wrong
deadline is worse than a student who never saw the listing. Trust is therefore a data-layer
property, not a UI badge.

## Every field carries its origin

`Opportunity.fieldProvenance` stores, per field:

```json
{ "applicationDeadline": {
    "method": "STRUCTURED_MARKUP",
    "sourceUrl": "https://example.edu/programme",
    "rawText": "Applications close 12 September 2026",
    "confidence": "HIGH",
    "at": "2026-08-18T09:14:00Z" } }
```

`method` ∈ `STRUCTURED_MARKUP | LABELLED_PAGE_TEXT | AI_EXTRACTED | ADMIN_ENTERED | ADMIN_CORRECTED
| USER_REPORTED`. The UI can therefore always answer "how do you know that?" for any single value,
and does — a provenance chip on hover/tap for every extracted field.

## Verification states

| State | Meaning | Student-visible |
|---|---|---|
| `VERIFIED` | A human confirmed the key fields against the official source | ✅ Verified · date |
| `RECENTLY_VERIFIED` | Automated re-fetch confirmed content unchanged within 14 days | ✅ Auto-checked · date |
| `NEEDS_REVIEW` | Conflicting sources, low-confidence extraction, or AI-extracted key fields | ⚠️ Details unconfirmed |
| `UNVERIFIED` | Discovered, fetch failed or thin data | ⚠️ Limited information |
| `EXPIRED` | Deadline passed, no known future cycle | Greyed, kept for reference |
| `ARCHIVED` | Dead link or withdrawn by organiser | Hidden from students |

**Nothing is ever displayed as confirmed on the strength of an AI extraction alone.** An AI-extracted
deadline caps the record at `NEEDS_REVIEW` until a human or structured markup confirms it.

## The four things that are never generated

Deadlines, eligibility rules, fees, and organiser identity. These are extracted verbatim or left
null. There is no fallback, no "typical", no "usually around". A null renders as an explicit
"Not stated on the source page — check the official page" with the link, which is more useful to a
student than a plausible fiction.

## Conflict handling

When two sources disagree on a deadline, the record does not pick a winner. It goes to
`NEEDS_REVIEW`, shows the student both values with both sources, and tells them to confirm on the
official page. Silent resolution is how directories become wrong.

## Contested and reported listings

Every opportunity page has "Report a problem" (wrong deadline / expired / not real / wrong
eligibility). A report immediately drops the record to `NEEDS_REVIEW` and queues it. One student's
report protects the next student.

## Partnerships (your section 31)

If a paid placement ever exists, it is a separate `isSponsored` boolean that (a) renders a
persistent, non-dismissable "Sponsored" label, (b) is excluded from the match score entirely, and
(c) cannot alter ranking within results. Sponsorship may buy visibility in a clearly demarcated
slot; it may never buy a better match score. This is enforced in the ranking function, not in policy.

## What testing the extractor found

`lib/discovery/extract/structured.ts` produces the `STRUCTURED_MARKUP` tier, which carries `HIGH`
confidence and is rendered to students as *"published in the page's own structured data by the
organiser"*. It was the largest module in the pipeline with no direct tests. Writing them
(`structured.test.ts`, 26 cases) found six defects, all of which had shipped, and all of which
produced a confident statement rather than a missing value — the worst possible failure mode here.

| What it did | What a student would have seen | Now |
|---|---|---|
| Read schema.org `applicationStartDate` as an application deadline | "Deadline: 15 January" for a programme that opens then and closes in June | A separate `APPLICATION_OPENS` kind, never conflated with a deadline |
| Stopped scanning page text for dates once markup produced *any* date | A page with `startDate` in JSON-LD and "applications close 3 March" in prose lost the closing date entirely | Text fills in per kind, so a missing deadline is still looked for |
| `Number('')` is `0`, so an unparseable price became a zero price | "Free" on a page that said "contact us" for its fee | A price must contain digits in the source, or there is no cost claim |
| Defaulted an unrecognised `courseMode` to `IN_PERSON` | An invented travel requirement, and a wrong format dimension in matching | Only schema.org's own vocabulary is recognised; anything else stays null |
| Attributed the `<title>` element to `STRUCTURED_MARKUP` | "Published in the page's own structured data" about "Programme \| Example University" | A title tag is page text and is labelled as such; OpenGraph keeps the markup tier |
| Pushed one date per JSON-LD node | The same start date listed two or three times, reading as three facts | Deduplicated by kind and day |

The pattern worth keeping: every one of these is a case where the code chose a plausible value over
no value. That is the single failure this product cannot tolerate, and it is why the tests here
assert as hard on what is *refused* as on what is extracted.

## Dates are described by kind, not by deadline language

`countdownText` applied deadline wording to every date, so the interface said "Results announced ·
Closed 3 days ago" and — once `APPLICATION_OPENS` existed — "Applications open · Closed 2 days ago",
which states the opposite of the truth: a programme that opened two days ago is open. `countdownFor`
and `bandFor` in `lib/intelligence/deadlines.ts` now pick wording from the kind. Only actionable
kinds are ever "due" or "closed"; everything else is "in 5 days" or "2 days ago", and a passed
non-actionable date reads "Already happened", or "Open now" for applications opening.

## What testing the AI tier found

`extract/ai.ts` is the only place in the pipeline where text Lumen did not read off the page can
reach a student, and it was untested. Twenty-five tests now cover it, with the model mocked
throughout — a guard that only works when the model cooperates is not a guard, so every test asks
the same question: *if the model returns something untrue, does it reach the corpus?*

The good news first, because it is the part that matters: **the verbatim guard holds.** A fabricated
deadline, a fabricated organiser, an invented fee, a made-up requirement and a promised benefit that
appears nowhere on the page are each discarded, and a response in which *every* field is fabricated
stores nothing at all. The layered checks work as designed — the deadline must survive both the
verbatim check and a re-parse by the deterministic date parser, and the cost keeps only the model's
wording while the number is re-derived from the phrase, so a hallucinated figure cannot pass.

Two defects did turn up:

| Defect | Consequence |
|---|---|
| `filled` was recorded when a phrase passed the verbatim check, not when a value was actually stored | Two paths quote a phrase successfully and then still discard it — an age range with no numbers, a cost phrase naming no fee. The count feeds the permanent audit note on the record, so it claimed "AI filled 2 fields" when it had filled none. |
| Straight double quotes were not folded to curly ones | A page publishing a typographic quote and a model copying it as a plain one are saying the same thing. The check rejected it as not verbatim, throwing away a true value. Safe direction, but a real loss. |

The first is the more interesting one. It was invisible from the outside — nothing displayed was
wrong, only the record of how the value came to be. That is precisely the kind of claim this
codebase is built to keep honest, and it had rotted in the one module nobody had tested.

### One judgement left as it stands

`format` is accepted from the model without a verbatim check, because it is a classification rather
than a quotation and there is nothing to compare against. It carries weight in matching but never
gates eligibility, and the model is instructed to return null rather than guess. This is a weaker
standard than everything around it, and it is noted here rather than quietly relied upon.
