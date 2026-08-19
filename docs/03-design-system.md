# Lumen — Design System

Direction (D9): optimistic light canvas, emerald accent, generous space, one confident sans at
several weights. Calm and fast, tuned young without being childish. Light-first, real dark mode.

## Colour

Semantic tokens only — components never reference a raw hex. Both themes defined explicitly;
neither is a filter over the other.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--surface-canvas` | `#FBFBF9` | `#0C0F0E` | Page ground |
| `--surface-raised` | `#FFFFFF` | `#141917` | Cards, sheets |
| `--surface-sunken` | `#F4F5F2` | `#090C0B` | Wells, inputs |
| `--border-hairline` | `#E7E8E3` | `#232A27` | 1px dividers |
| `--text-primary` | `#111814` | `#F2F4F1` | Headlines, body |
| `--text-secondary` | `#5A635C` | `#A3ADA6` | Support (4.6:1 both) |
| `--text-tertiary` | `#828A83` | `#7C857E` | Metadata (min 4.5:1) |
| `--accent` | `#0E7C55` | `#34D399` | Primary action, match |
| `--accent-wash` | `#ECFDF3` | `#0F241C` | Selected, subtle fills |
| `--accent-contrast` | `#FFFFFF` | `#04120C` | Text on accent |

Status colours are always paired with an icon and a word — never colour alone (accessibility):

| Token | Light | Meaning |
|---|---|---|
| `--urgent` `#B42318` | 🔴 ≤3 days | "Due in 2 days" |
| `--soon` `#B54708` | 🟠 4–7 days | "Due in 5 days" |
| `--upcoming` `#854A0E` | 🟡 8–21 days | "Due in 12 days" |
| `--calm` `#0E7C55` | 🟢 >21 days | "Due in 6 weeks" |
| `--caution` `#7A5AF8` | ⚠️ | Unverified / needs review |

Contrast: all text pairs ≥ 4.5:1, large text ≥ 3:1, UI borders ≥ 3:1 — verified by an automated
token-contrast test in CI, not by eye.

## Type

**Inter** (variable, self-hosted, subset) for everything, with a system stack fallback. One family,
many weights, is faster and more coherent than a display/body pairing here.

| Role | Size / line | Weight | Tracking |
|---|---|---|---|
| Display | 44/1.08 (mobile 32/1.12) | 700 | −0.02em |
| H1 | 32/1.15 | 650 | −0.015em |
| H2 | 24/1.25 | 600 | −0.01em |
| H3 | 19/1.35 | 600 | 0 |
| Body | 15.5/1.6 | 400 | 0 |
| Body strong | 15.5/1.6 | 550 | 0 |
| Caption | 13/1.45 | 450 | 0.005em |
| Micro / label | 11.5/1.35 | 600 | 0.06em, uppercase |
| Numeric | tabular-nums everywhere a number can change |

## Space & shape

4px base: `4 8 12 16 20 24 32 40 56 72 96`. Radii: `6` inputs · `12` cards · `16` sheets ·
`999` pills. Elevation is restrained — three levels, low-alpha and tight
(`0 1px 2px rgba(17,24,20,.06)` / `0 4px 12px …/.07` / `0 12px 32px …/.10`); in dark mode elevation
is expressed by surface lightness plus a hairline, not by shadow.

Content max width 1200px; reading columns cap at 68ch.

## Components (V1 inventory)

Primitives: Button (primary/secondary/ghost/danger, 3 sizes, loading + disabled), IconButton, Input,
Textarea, Select, Combobox, TagPicker, Checkbox, Radio, Switch, Slider, DateField, SegmentedControl,
Badge, Pill, Chip (removable filter), Avatar, Tooltip, Popover, Dialog, Sheet (mobile), Toast,
Tabs, Accordion, Table, Pagination, Skeleton, EmptyState, ErrorState, ProgressBar, Meter, Stepper.

Domain: `MatchBadge` (score + confidence + top reason), `ReasonList`, `ProvenanceChip`,
`VerificationBadge`, `DeadlineChip` (icon + word + colour), `OpportunityCard`, `OpportunityRow`,
`ComparisonTable`, `StatusPill`, `ChecklistItem` (with lead-time warning), `ReadinessMeter`,
`ProfileStrengthBars`, `SourceList`, `FilterRail`, `InterpretedQueryChips`.

Every interactive element: min 44×44px touch target, visible `:focus-visible` ring
(2px accent + 2px offset), and a non-colour state indicator.

## Motion

Durations `120ms` (state) · `180ms` (enter) · `240ms` (sheet/dialog) · `320ms` (celebration).
Easing: `cubic-bezier(.2,.8,.2,1)` entering, `cubic-bezier(.4,0,1,1)` exiting.
Cards stagger in at 24ms intervals, capped at 8 items. Save is a spring on the bookmark plus an
optimistic state change. Status transitions slide within the pill. Submitting an application gets
one restrained success moment — no confetti storm.

`@media (prefers-reduced-motion: reduce)` collapses every animation to opacity ≤80ms, and all
stagger is removed. Nothing conveys meaning through motion alone.

## Responsive

Breakpoints `480 / 768 / 1024 / 1280`. Mobile is designed, not shrunk: bottom tab bar, filters in a
full-height sheet with an apply button, sticky save/apply bar on detail pages, comparison as
frozen-label horizontal scroll, single-column cards with the deadline chip in the top-right thumb arc.


## Interaction: forms, not click handlers

Every state-changing control a student uses repeatedly — saving an opportunity,
ticking a checklist step, saving the profile — is a real `<form>` posting to a
server action, not a click handler on a hydrated component.

This was found by testing rather than reasoned about in advance: a click that
lands before React hydrates hits a dead button, and on a mid-range phone on a
slow connection that window is real. A student tapping Save and seeing nothing
happen is the kind of failure that loses trust quietly.

`useFormStatus` supplies the pending state, and the label flips to the target
state while the post is in flight, so it still feels instant once hydrated. The
optimistic UI is an enhancement on top of a working mechanism, never the
mechanism itself.

The checklist step is a submit button carrying `role="checkbox"` and
`aria-checked`, which keeps the keyboard and screen-reader behaviour of a real
checkbox while remaining a form submission.
