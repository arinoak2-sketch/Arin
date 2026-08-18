# Lumen — Match Engine (deterministic, explainable)

No model call. Pure functions over structured `EligibilityRule` rows and the student profile.
Same inputs ⇒ same score ⇒ same reasons, every time.

## Two-stage design

**Stage 1 — Hard eligibility gate.** Any `MISMATCH` on a hard dimension (age, grade,
education level, country/residency/citizenship, school enrolment) means the opportunity is
*not eligible*. It is not scored 40% and buried; it is labelled **Not eligible** with the exact
reason, and hidden by default behind a "show ineligible" toggle. A 40% score on something a student
literally cannot enter is a lie of omission.

**Stage 2 — Fit score** over soft dimensions, only for eligible opportunities.

## Dimensions and default weights

| Dimension | Weight | Source |
|---|---|---|
| Subject / interest overlap | 30 | ProfileTag ∩ OpportunityTag, synonym-aware |
| Career direction alignment | 15 | profile.careerDirections vs opportunity tags |
| Format & location fit | 12 | format preference, country, travel radius |
| Cost fit | 12 | budgetCeiling vs costType/costAmount; aid availability softens a miss |
| Timing fit | 12 | deadline vs today; programme dates vs stated availability |
| Experience fit | 10 | achievements vs PRIOR_EXPERIENCE rules (both directions: under- and over-qualified) |
| Profile-gap value | 9 | boosts a dimension the student is thin in *only if* they've expressed interest in it |

Weights live in one exported constant with a version number. Changing them bumps
`MatchResult.engineVersion`.

## Unknowns are not zeros

If an opportunity never states its cost, that dimension is `UNKNOWN`. It is **excluded from the
denominator**, and the UI says "Cost not stated on the source page". Treating unknown as a mismatch
would punish honest sparse listings; treating it as a match would fabricate. Removing it from the
score and saying so is the only truthful option. Every card shows a confidence indicator derived
from how many dimensions were evaluable.

## Output contract

```ts
{
  score: 94,                       // integer, only over evaluable dimensions
  confidence: 'HIGH',              // HIGH ≥6 dims, MEDIUM 4–5, LOW ≤3
  eligible: true,
  reasons: [
    { dimension:'AGE', verdict:'MATCH', humanText:"You're 16; this is open to 14–18.",
      evidence:{ rawText:'Open to students aged 14-18', sourceUrl:'…' } },
    { dimension:'SUBJECT', verdict:'MATCH', humanText:'Matches your interest in molecular biology.' },
    { dimension:'PRIOR_EXPERIENCE', verdict:'PARTIAL',
      humanText:'Asks for prior research experience. Your profile shows a school science project — you may need to make that case explicitly.' },
    { dimension:'COST', verdict:'UNKNOWN', humanText:'Cost is not stated on the source page.' }
  ]
}
```

`humanText` is a template filled from real values — not model prose. It is deterministic, it is
translatable, and it can never hallucinate an eligibility rule that isn't in the row it cites.

## Concerns, stated plainly

Every `PARTIAL` and `MISMATCH` becomes a "Worth knowing" item on the detail page, always quoting the
source's own words. The student sees the weakness before they invest a weekend in the application.

## Benefit analysis ("Why this could be valuable for you")

Deterministic, three-tier labelling, per your section 5:

- **Stated by organiser** — quoted from the source page, with a link. e.g. "Participants receive a
  certificate of completion."
- **Structural** — derived from what the opportunity factually *is*, not from a claim about outcomes.
  A 6-week team-based build event structurally involves collaboration and a deliverable. Labelled
  "Based on the programme format".
- **Lumen's interpretation** — the personalised sentence connecting it to *this* student's profile.
  Visibly badged, always hedged, never predictive of admissions outcomes.

A hard content rule ships as a lint test in CI: benefit copy may not contain claims about admission
to any named institution, guaranteed outcomes, or comparative prestige. The test fails the build on
a banned-phrase list ("will get you into", "guarantees", "top students always").
