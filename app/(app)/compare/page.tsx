import Link from 'next/link'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { decodeRequirements } from '@/lib/db/codec'
import type { VerificationState } from '@/lib/db/enums'
import { assessWorth } from '@/lib/intelligence/benefits'
import { triage } from '@/lib/intelligence/deadlines'
import { scoreMatch } from '@/lib/intelligence/match'
import { opportunityInclude, toScorableOpportunity } from '@/lib/repo/mappers'
import { loadProfile } from '@/lib/repo/opportunities'
import { Card, EmptyState, Eyebrow, LinkButton, Row, Stack } from '@/components/ui/primitives'
import { DeadlineChip, formatDate, VerificationBadge } from '@/components/opportunity/indicators'

export const metadata = { title: 'Compare' }
export const dynamic = 'force-dynamic'

/**
 * Side-by-side comparison of two to four opportunities.
 *
 * On mobile this is a horizontally scrollable table with a frozen label column
 * rather than a shrunk grid — the row labels are what make the numbers mean
 * anything, so they are the one thing that must never scroll away.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>
}) {
  const user = await requireUser()
  const params = await searchParams
  const now = new Date()

  const ids = (Array.isArray(params.ids) ? params.ids : params.ids ? params.ids.split(',') : [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)

  const profile = await loadProfile(user.id)

  const records =
    ids.length > 0
      ? await prisma.opportunity.findMany({ where: { id: { in: ids } }, include: opportunityInclude })
      : await prisma.opportunity.findMany({
          where: { saved: { some: { userId: user.id, state: { in: ['SAVED', 'CONSIDERING'] } } } },
          include: opportunityInclude,
          take: 4,
        })

  const columns = records.map((record) => {
    const scorable = toScorableOpportunity(record)
    const match = scoreMatch(scorable, profile, now)
    const deadlines = triage(record.deadlines, now)
    const requirements = decodeRequirements(record.requirements)
    return {
      record,
      match,
      primary: deadlines.find((d) => d.actionable && d.urgency.level !== 'PASSED') ?? null,
      worth: assessWorth(scorable, profile, requirements.length, match.score),
      requirementCount: requirements.length,
    }
  })

  if (columns.length < 2) {
    return (
      <Stack gap={22}>
        <Stack gap={6}>
          <Eyebrow>Compare</Eyebrow>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.022em' }}>Compare side by side</h1>
        </Stack>
        <EmptyState
          icon="⊞"
          title="Save at least two opportunities to compare them"
          description="Comparison works on whatever you have saved, or on a specific set you pick. It lines up match, deadline, cost, format and effort so the differences are the thing you see first."
          action={
            <LinkButton href="/discover" variant="primary" size="sm">
              Find opportunities
            </LinkButton>
          }
        />
      </Stack>
    )
  }

  /** A row is "differing" when its values are not all identical — those get emphasis. */
  const rows: Array<{ label: string; values: string[]; kind?: 'match' | 'deadline' | 'verification' }> = [
    { label: 'Match', values: columns.map((c) => (c.match.eligible ? `${c.match.score}%` : 'Not eligible')), kind: 'match' },
    { label: 'Confidence', values: columns.map((c) => c.match.confidence.toLowerCase()) },
    {
      label: 'Deadline',
      values: columns.map((c) => (c.primary ? formatDate(c.primary.date) : 'Not stated')),
      kind: 'deadline',
    },
    { label: 'Cost', values: columns.map((c) => c.worth.costLabel) },
    { label: 'Format', values: columns.map((c) => formatLabel(c.record.format)) },
    {
      label: 'Location',
      values: columns.map((c) =>
        c.record.format === 'ONLINE'
          ? 'Anywhere'
          : [c.record.locationCity, c.record.locationCountry].filter(Boolean).join(', ') || 'Not stated',
      ),
    },
    {
      label: 'Duration',
      values: columns.map((c) =>
        c.record.durationText ?? (c.record.durationDays ? `${c.record.durationDays} days` : 'Not stated'),
      ),
    },
    { label: 'Time commitment', values: columns.map((c) => titleise(c.worth.timeCommitment)) },
    { label: 'Application effort', values: columns.map((c) => titleise(c.worth.applicationEffort)) },
    { label: 'Things to submit', values: columns.map((c) => (c.requirementCount === 0 ? 'Not stated' : String(c.requirementCount))) },
    { label: 'Skill relevance', values: columns.map((c) => titleise(c.worth.skillRelevance)) },
    { label: 'Verification', values: columns.map((c) => c.record.verificationState), kind: 'verification' },
  ]

  return (
    <Stack gap={24}>
      <Stack gap={6}>
        <Eyebrow>Compare</Eyebrow>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.022em' }}>
          {columns.length} opportunities, side by side
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: '62ch' }}>
          Rows where the options actually differ are emphasised. “Not stated” means the source page does not say — it
          is never filled in with a guess.
        </p>
      </Stack>

      <div className="scroll-x" style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-card)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 140 + columns.length * 200 }}>
          <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            Comparison of saved opportunities by match, deadline, cost, format and effort
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                style={{
                  ...headCell,
                  position: 'sticky',
                  insetInlineStart: 0,
                  zIndex: 2,
                  background: 'var(--surface-sunken)',
                  minWidth: 140,
                }}
              >
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                  Attribute
                </span>
              </th>
              {columns.map((c) => (
                <th key={c.record.id} scope="col" style={{ ...headCell, minWidth: 200, verticalAlign: 'top' }}>
                  <Stack gap={6}>
                    <Link
                      href={`/opportunity/${c.record.slug}`}
                      style={{ fontSize: 14.5, fontWeight: 650, textDecoration: 'none', lineHeight: 1.35 }}
                    >
                      {c.record.title}
                    </Link>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                      {c.record.organization?.name ?? hostOf(c.record.officialUrl)}
                    </span>
                  </Stack>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const differs = new Set(row.values).size > 1
              return (
                <tr key={row.label}>
                  <th
                    scope="row"
                    style={{
                      ...bodyCell,
                      position: 'sticky',
                      insetInlineStart: 0,
                      zIndex: 1,
                      background: 'var(--surface-sunken)',
                      textAlign: 'left',
                      fontWeight: 600,
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      borderInlineEnd: '1px solid var(--border-hairline)',
                    }}
                  >
                    {row.label}
                  </th>
                  {row.values.map((value, i) => (
                    <td
                      key={`${row.label}-${i}`}
                      className={row.kind === 'match' ? 'tabular' : undefined}
                      style={{
                        ...bodyCell,
                        fontWeight: differs ? 650 : 400,
                        color:
                          value === 'Not stated'
                            ? 'var(--text-tertiary)'
                            : differs
                              ? 'var(--text-primary)'
                              : 'var(--text-secondary)',
                      }}
                    >
                      {row.kind === 'verification' ? (
                        <VerificationBadge
                          state={value as VerificationState}
                          lastVerifiedAt={columns[i]!.record.lastVerifiedAt}
                        />
                      ) : row.kind === 'deadline' && columns[i]!.primary ? (
                        <Stack gap={5}>
                          <span className="tabular">{value}</span>
                          <DeadlineChip
                            band={columns[i]!.primary!.urgency}
                            countdown={columns[i]!.primary!.countdown}
                          />
                        </Stack>
                      ) : (
                        value
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Stack gap={12}>
        <h2 style={{ fontSize: 17, fontWeight: 650 }}>Lumen’s read on each</h2>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {columns.map((c) => (
            <Card key={c.record.id}>
              <Stack gap={8}>
                <Link href={`/opportunity/${c.record.slug}`} style={{ fontSize: 14.5, fontWeight: 650, textDecoration: 'none' }}>
                  {c.record.title}
                </Link>
                <span
                  style={{
                    alignSelf: 'flex-start',
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: 'var(--caution)',
                    border: '1px solid currentColor',
                    background: 'var(--caution-wash)',
                    borderRadius: 'var(--radius-pill)',
                    padding: '3px 9px',
                  }}
                >
                  Lumen’s interpretation
                </span>
                <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{c.worth.assessment}</p>
              </Stack>
            </Card>
          ))}
        </div>
      </Stack>

      <Row gap={10}>
        <LinkButton href="/discover" size="sm">
          Back to discovery
        </LinkButton>
      </Row>
    </Stack>
  )
}

const headCell: React.CSSProperties = {
  textAlign: 'left',
  padding: '13px 15px',
  borderBottom: '1px solid var(--border-hairline)',
  background: 'var(--surface-sunken)',
  fontWeight: 600,
}

const bodyCell: React.CSSProperties = {
  padding: '12px 15px',
  borderBottom: '1px solid var(--border-hairline)',
  fontSize: 13.5,
  verticalAlign: 'top',
  background: 'var(--surface-raised)',
}

const titleise = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Unknown organiser'
  }
}

function formatLabel(format: string): string {
  return format === 'IN_PERSON' ? 'In person' : format === 'ONLINE' ? 'Online' : format === 'HYBRID' ? 'Hybrid' : 'Not stated'
}
