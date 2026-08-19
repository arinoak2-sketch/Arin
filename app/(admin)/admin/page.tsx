import Link from 'next/link'
import { prisma } from '@/lib/db/client'
import { decodeStringArray } from '@/lib/db/codec'
import { decodeProvenance, METHOD_EXPLANATION } from '@/lib/discovery/provenance'
import { searchBudgetStatus } from '@/lib/discovery/pipeline'
import { retentionPreview } from '@/lib/jobs/retention'
import { triage } from '@/lib/intelligence/deadlines'
import type { VerificationState } from '@/lib/db/enums'
import { Card, EmptyState, Eyebrow, Row, SectionHeading, Stack, Tag } from '@/components/ui/primitives'
import { formatDate, VerificationBadge } from '@/components/opportunity/indicators'
import { ReviewActions } from '@/components/admin/review-actions'
import { RetentionPanel } from '@/components/admin/retention-panel'
import { SweepButton } from '@/components/admin/sweep-button'

export const metadata = { title: 'Admin' }
export const dynamic = 'force-dynamic'

/**
 * The review queue and data-quality dashboard.
 *
 * Ordered lowest-confidence first: the listings most likely to mislead a
 * student are the ones a reviewer should see first, not the newest ones.
 */
export default async function AdminPage() {
  const now = new Date()

  const [queue, counts, reports, budget, aiExtracted, oldest] = await Promise.all([
    prisma.opportunity.findMany({
      where: { verificationState: { in: ['NEEDS_REVIEW', 'UNVERIFIED'] } },
      include: { sources: true, deadlines: true, verifications: { orderBy: { createdAt: 'desc' }, take: 3 } },
      orderBy: [{ verificationState: 'asc' }, { firstSeenAt: 'desc' }],
      take: 25,
    }),
    prisma.opportunity.groupBy({ by: ['verificationState'], _count: true }),
    prisma.verificationEvent.findMany({
      where: { action: 'REPORTED' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { opportunity: { select: { slug: true, title: true } } },
    }),
    searchBudgetStatus(now),
    prisma.opportunity.count({ where: { fieldProvenance: { contains: 'AI_EXTRACTED' } } }),
    prisma.opportunity.findFirst({
      where: { verificationState: { in: ['VERIFIED', 'RECENTLY_VERIFIED'] } },
      orderBy: { lastVerifiedAt: 'asc' },
      select: { title: true, slug: true, lastVerifiedAt: true },
    }),
  ])

  const retention = await retentionPreview(now)
  const total = counts.reduce((n, c) => n + c._count, 0)
  const byState = Object.fromEntries(counts.map((c) => [c.verificationState, c._count]))
  const missingDeadline = await prisma.opportunity.count({
    where: { verificationState: { notIn: ['ARCHIVED', 'EXPIRED'] }, deadlines: { none: {} } },
  })

  return (
    <Stack gap={30}>
      <Stack gap={6}>
        <Eyebrow>Data quality</Eyebrow>
        <h1 style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-0.022em' }}>Review queue</h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: '64ch' }}>
          Nothing here reaches students as verified until a person confirms it against the official page. Lowest
          confidence first.
        </p>
      </Stack>

      {/* Quality metrics */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Metric label="In corpus" value={String(total)} />
        <Metric label="Awaiting review" value={String((byState.NEEDS_REVIEW ?? 0) + (byState.UNVERIFIED ?? 0))} tone="caution" />
        <Metric label="Human-verified" value={String(byState.VERIFIED ?? 0)} tone="accent" />
        <Metric label="Expired" value={String(byState.EXPIRED ?? 0)} />
        <Metric
          label="With AI-extracted fields"
          value={String(aiExtracted)}
          hint="Capped at “needs review” until confirmed."
        />
        <Metric
          label="No deadline recorded"
          value={String(missingDeadline)}
          hint="Shown to students as “not stated”, never guessed."
        />
        <Metric
          label="Live searches this month"
          value={`${budget.used} / ${budget.limit}`}
          tone={budget.remaining < 100 ? 'caution' : undefined}
        />
      </div>

      {oldest?.lastVerifiedAt ? (
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
          Oldest verified listing:{' '}
          <Link href={`/opportunity/${oldest.slug}`} style={{ color: 'var(--accent)' }}>
            {oldest.title}
          </Link>{' '}
          — last checked {formatDate(oldest.lastVerifiedAt)}.
        </p>
      ) : null}

      <Row gap={10}>
        <SweepButton />
      </Row>

      <RetentionPanel
        dueQueries={retention.dueQueries}
        totalQueries={retention.totalQueries}
        retentionDays={retention.retentionDays}
        oldestQueryAt={retention.oldestQueryAt ? formatDate(retention.oldestQueryAt) : null}
      />

      {/* Reports */}
      {reports.length > 0 ? (
        <Stack gap={12}>
          <SectionHeading
            eyebrow="Reports"
            title="Reported by students"
            description="Each of these already dropped the listing to “needs review” when it was reported."
          />
          <Card padded={false}>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {reports.map((report, i) => (
                <li key={report.id} style={{ padding: '12px 17px', borderTop: i === 0 ? 'none' : '1px solid var(--border-hairline)' }}>
                  <Stack gap={3}>
                    <Link href={`/opportunity/${report.opportunity.slug}`} style={{ fontSize: 14, fontWeight: 600 }}>
                      {report.opportunity.title}
                    </Link>
                    <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                      {formatDate(report.createdAt)} · {reportedFields(report.fieldsTouched)}
                      {report.note ? ` — ${report.note}` : ''}
                    </span>
                  </Stack>
                </li>
              ))}
            </ul>
          </Card>
        </Stack>
      ) : null}

      {/* Queue */}
      <Stack gap={14}>
        <SectionHeading eyebrow="Queue" title={`${queue.length} awaiting review`} />
        {queue.length === 0 ? (
          <EmptyState
            icon="✓"
            title="Nothing waiting"
            description="Every listing in the corpus has either been confirmed by a person or is showing students its unconfirmed status honestly."
          />
        ) : (
          <Stack gap={14}>
            {queue.map((item) => {
              const provenance = decodeProvenance(item.fieldProvenance)
              const deadlines = triage(item.deadlines, now)
              const aiFields = Object.entries(provenance).filter(([, p]) => p.method === 'AI_EXTRACTED')

              return (
                <Card key={item.id}>
                  <Stack gap={13}>
                    <Row gap={14} align="flex-start" style={{ justifyContent: 'space-between' }}>
                      <Stack gap={4} style={{ minWidth: 0 }}>
                        <Link href={`/opportunity/${item.slug}`} style={{ fontSize: 16, fontWeight: 650, textDecoration: 'none' }}>
                          {item.title}
                        </Link>
                        <Row gap={8}>
                          <VerificationBadge state={item.verificationState as VerificationState} lastVerifiedAt={item.lastVerifiedAt} />
                          <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                            found {formatDate(item.firstSeenAt)}
                          </span>
                        </Row>
                      </Stack>
                    </Row>

                    <Row gap={8}>
                      {deadlines.length === 0 ? (
                        <Tag>No dates extracted</Tag>
                      ) : (
                        deadlines.slice(0, 3).map((d, i) => (
                          <Tag key={i}>
                            {d.label}: {d.isRollingAdmission ? 'rolling' : formatDate(d.date)}
                          </Tag>
                        ))
                      )}
                    </Row>

                    {aiFields.length > 0 ? (
                      <div
                        style={{
                          padding: '11px 13px',
                          borderRadius: 'var(--radius-input)',
                          background: 'var(--caution-wash)',
                          border: '1px solid var(--border-hairline)',
                          borderLeft: '3px solid var(--caution)',
                        }}
                      >
                        <Stack gap={6}>
                          <strong style={{ fontSize: 13, fontWeight: 650, color: 'var(--caution)' }}>
                            {aiFields.length} AI-extracted {aiFields.length === 1 ? 'field' : 'fields'} — confirm against the source
                          </strong>
                          {aiFields.map(([field, p]) => (
                            <span key={field} style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                              <strong>{field}</strong>
                              {p.rawText ? ` — page text: “${p.rawText}”` : ` — ${METHOD_EXPLANATION[p.method]}`}
                            </span>
                          ))}
                        </Stack>
                      </div>
                    ) : null}

                    <Stack gap={6}>
                      {item.sources.map((source) => (
                        <a
                          key={source.id}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 13, color: 'var(--accent)', wordBreak: 'break-all' }}
                        >
                          {source.isOfficial ? '★ ' : ''}
                          {source.url}
                        </a>
                      ))}
                    </Stack>

                    <ReviewActions opportunityId={item.id} />
                  </Stack>
                </Card>
              )
            })}
          </Stack>
        )}
      </Stack>
    </Stack>
  )
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'accent' | 'caution'
}) {
  return (
    <Card>
      <Stack gap={4}>
        <Eyebrow>{label}</Eyebrow>
        <span
          className="tabular"
          style={{ fontSize: 24, fontWeight: 700, color: tone ? `var(--${tone})` : 'var(--text-primary)' }}
        >
          {value}
        </span>
        {hint ? <span style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.45 }}>{hint}</span> : null}
      </Stack>
    </Card>
  )
}

/**
 * A student's report names the fields they think are wrong. Decoded through the
 * codec rather than JSON.parse: this is the admin queue, so the one row most
 * likely to hold a malformed value is exactly the row someone came here to fix,
 * and it must not be the row that takes the page down.
 */
function reportedFields(raw: string | null | undefined): string {
  const fields = decodeStringArray(raw)
  if (fields.length === 0) return 'no fields named'
  return fields.join(', ').toLowerCase().replace(/_/g, ' ')
}
