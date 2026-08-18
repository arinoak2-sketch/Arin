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
