import type { ReactNode } from 'react'
import type { VerificationState } from '@/lib/db/enums'
import { METHOD_EXPLANATION, type FieldProvenance } from '@/lib/discovery/provenance'
import type { UrgencyBand } from '@/lib/intelligence/deadlines'
import type { MatchReason, Verdict } from '@/lib/intelligence/types'
import { Badge, Row } from '@/components/ui/primitives'

/**
 * The trust indicators. These are the components that carry Lumen's promises,
 * so each one is built so the promise cannot be broken by a caller:
 * urgency always renders a word, verification always renders its date, and a
 * provenance chip always names the method it came from.
 */

// ── Deadline urgency ─────────────────────────────────────────────────────────

const URGENCY_GLYPH: Record<UrgencyBand['shape'], string> = {
  alert: '▲',
  warning: '◆',
  clock: '●',
  calendar: '○',
  archive: '—',
}

export function DeadlineChip({
  band,
  countdown,
  kindLabel,
}: {
  band: UrgencyBand
  countdown: string
  kindLabel?: string
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '4px 11px',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid currentColor',
        background: `var(--${band.token}-wash)`,
        color: `var(--${band.token})`,
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {/* Shape + word + colour together: the information survives greyscale. */}
      <span aria-hidden="true">{URGENCY_GLYPH[band.shape]}</span>
      <span>
        {kindLabel ? `${kindLabel}: ` : ''}
        {countdown}
      </span>
    </span>
  )
}

// ── Verification ─────────────────────────────────────────────────────────────

const VERIFICATION_PRESENTATION: Record<
  VerificationState,
  { label: (date: string | null) => string; tone: 'accent' | 'caution' | 'passed'; glyph: string; help: string }
> = {
  VERIFIED: {
    label: (d) => (d ? `Verified · ${d}` : 'Verified'),
    tone: 'accent',
    glyph: '✓',
    help: 'A person checked the key details against the official page.',
  },
  RECENTLY_VERIFIED: {
    label: (d) => (d ? `Auto-checked · ${d}` : 'Auto-checked'),
    tone: 'accent',
    glyph: '✓',
    help: 'An automated re-fetch found the official page unchanged.',
  },
  NEEDS_REVIEW: {
    label: () => 'Details unconfirmed',
    tone: 'caution',
    glyph: '!',
    help: 'Some details could not be confirmed. Check the official page before you rely on them.',
  },
  UNVERIFIED: {
    label: () => 'Limited information',
    tone: 'caution',
    glyph: '!',
    help: 'Lumen could only read part of this listing. Treat it as a starting point.',
  },
  EXPIRED: {
    label: () => 'Closed',
    tone: 'passed',
    glyph: '—',
    help: 'The application deadline has passed and no future cycle is recorded.',
  },
  ARCHIVED: {
    label: () => 'Archived',
    tone: 'passed',
    glyph: '—',
    help: 'This listing is no longer live.',
  },
}

export function VerificationBadge({
  state,
  lastVerifiedAt,
}: {
  state: VerificationState
  lastVerifiedAt?: Date | null
}) {
  const preset = VERIFICATION_PRESENTATION[state]
  const date = lastVerifiedAt ? formatDate(lastVerifiedAt) : null
  return (
    <span title={preset.help}>
      <Badge tone={preset.tone} icon={<span aria-hidden="true">{preset.glyph}</span>}>
        {preset.label(date)}
      </Badge>
    </span>
  )
}

export const verificationHelp = (state: VerificationState): string => VERIFICATION_PRESENTATION[state].help

// ── Match ────────────────────────────────────────────────────────────────────

export function MatchBadge({
  score,
  confidence,
  eligible,
  size = 'md',
}: {
  score: number
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  eligible: boolean
  size?: 'sm' | 'md'
}) {
  if (!eligible) {
    return (
      <div style={{ textAlign: 'right' }}>
        <Badge tone="passed">Not eligible</Badge>
      </div>
    )
  }
  return (
    <div style={{ textAlign: 'right', flex: 'none' }}>
      <div
        className="tabular"
        style={{
          fontSize: size === 'sm' ? 21 : 27,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: '-0.03em',
          color: 'var(--accent)',
        }}
      >
        {score}
        <span style={{ fontSize: '0.55em', fontWeight: 600, marginLeft: 1 }}>%</span>
      </div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          marginTop: 3,
          fontWeight: 600,
        }}
      >
        {/* Confidence is shown beside every score: a 94% over three known
            dimensions is not the same claim as a 94% over seven. */}
        Match · {confidence.toLowerCase()}
      </div>
    </div>
  )
}

const VERDICT_GLYPH: Record<Verdict, { glyph: string; colour: string; label: string }> = {
  MATCH: { glyph: '✓', colour: 'var(--accent)', label: 'Matches' },
  PARTIAL: { glyph: '~', colour: 'var(--soon)', label: 'Partly matches' },
  MISMATCH: { glyph: '×', colour: 'var(--urgent)', label: 'Does not match' },
  UNKNOWN: { glyph: '?', colour: 'var(--text-tertiary)', label: 'Not stated' },
}

export function ReasonList({ reasons, limit }: { reasons: MatchReason[]; limit?: number }) {
  const shown = limit ? reasons.slice(0, limit) : reasons
  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 7, margin: 0, padding: 0, listStyle: 'none' }}>
      {shown.map((r, i) => {
        const v = VERDICT_GLYPH[r.verdict]
        return (
          <li key={`${r.dimension}-${i}`} style={{ display: 'flex', gap: 10, fontSize: 13.5, lineHeight: 1.5 }}>
            <span aria-hidden="true" style={{ flex: 'none', width: 13, fontWeight: 700, color: v.colour }}>
              {v.glyph}
            </span>
            <span style={{ color: 'var(--text-secondary)', minWidth: 0 }}>
              {/* The verdict is in the text for screen readers, not only in the glyph. */}
              <span
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  overflow: 'hidden',
                  clip: 'rect(0 0 0 0)',
                  whiteSpace: 'nowrap',
                }}
              >
                {v.label}:{' '}
              </span>
              {r.humanText}
              {r.evidence?.rawText ? (
                <span style={{ display: 'block', marginTop: 3, color: 'var(--text-tertiary)', fontSize: 12.5 }}>
                  Source says: “{r.evidence.rawText}”
                </span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// ── Provenance ───────────────────────────────────────────────────────────────

/**
 * Answers "how do you know that?" for a single field. Rendered next to any
 * extracted value that a student might act on.
 */
export function ProvenanceChip({ provenance, field }: { provenance: FieldProvenance | undefined; field: string }) {
  if (!provenance) {
    return (
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }} title={`Lumen has no recorded source for ${field}.`}>
        no source recorded
      </span>
    )
  }
  const isAi = provenance.method === 'AI_EXTRACTED'
  return (
    <span
      title={`${METHOD_EXPLANATION[provenance.method]}${provenance.rawText ? `\n\nSource text: “${provenance.rawText}”` : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11.5,
        color: isAi ? 'var(--caution)' : 'var(--text-tertiary)',
        borderBottom: '1px dotted currentColor',
        cursor: 'help',
      }}
    >
      {isAi ? 'AI-extracted, unconfirmed' : provenance.method === 'STRUCTURED_MARKUP' ? 'from page data' : 'from page text'}
    </span>
  )
}

/**
 * The three-tier benefit label. The tier is never implied by styling alone —
 * it is always written out.
 */
export function BenefitTierLabel({ tier }: { tier: 'STATED' | 'STRUCTURAL' | 'INTERPRETED' }) {
  const preset = {
    STATED: { text: 'Stated by the organiser', tone: 'accent' as const },
    STRUCTURAL: { text: 'Based on the programme format', tone: 'neutral' as const },
    INTERPRETED: { text: 'Lumen’s interpretation', tone: 'caution' as const },
  }[tier]
  return <Badge tone={preset.tone}>{preset.text}</Badge>
}

// ── Shared helpers ───────────────────────────────────────────────────────────

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    date,
  )
}

export function MetaRow({ children }: { children: ReactNode }) {
  return (
    <Row gap={7} style={{ paddingTop: 2 }}>
      {children}
    </Row>
  )
}
