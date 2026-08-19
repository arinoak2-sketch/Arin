import Link from 'next/link'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { DEADLINE_LABELS, type DeadlineKind } from '@/lib/db/enums'
import { bucketByUrgency, triage, type TriagedDeadline } from '@/lib/intelligence/deadlines'
import { Card, EmptyState, Eyebrow, LinkButton, Row, Stack, Tag } from '@/components/ui/primitives'
import { DeadlineChip, formatDate } from '@/components/opportunity/indicators'

export const metadata = { title: 'Calendar' }
export const dynamic = 'force-dynamic'

interface CalendarEntry {
  entry: TriagedDeadline
  title: string
  slug: string
  source: 'application' | 'saved'
}

/**
 * The calendar.
 *
 * Agenda-first, because the question a student actually has is "what is coming
 * up", not "what does this month look like as a grid". Typed events are colour
 * AND word AND icon coded, and application deadlines are never mixed in with
 * programme dates.
 */
export default async function CalendarPage() {
  const user = await requireUser()
  const now = new Date()

  const [applications, saved] = await Promise.all([
    prisma.application.findMany({
      where: { userId: user.id, status: { notIn: ['REJECTED', 'WITHDRAWN'] } },
      select: { opportunity: { select: { slug: true, title: true, deadlines: true } } },
    }),
    prisma.savedOpportunity.findMany({
      where: { userId: user.id, state: { in: ['SAVED', 'CONSIDERING'] } },
      select: { opportunity: { select: { slug: true, title: true, deadlines: true } } },
    }),
  ])

  const entries: CalendarEntry[] = []
  const seen = new Set<string>()

  for (const { opportunity } of applications) {
    for (const entry of triage(opportunity.deadlines, now)) {
      entries.push({ entry, title: opportunity.title, slug: opportunity.slug, source: 'application' })
      seen.add(opportunity.slug)
    }
  }
  for (const { opportunity } of saved) {
    if (seen.has(opportunity.slug)) continue
    for (const entry of triage(opportunity.deadlines, now)) {
      entries.push({ entry, title: opportunity.title, slug: opportunity.slug, source: 'saved' })
    }
  }

  const upcoming = entries
    .filter((e) => e.entry.urgency.level !== 'PASSED' && !e.entry.isRollingAdmission)
    .sort((a, b) => a.entry.date.getTime() - b.entry.date.getTime())

  const past = entries
    .filter((e) => e.entry.urgency.level === 'PASSED')
    .sort((a, b) => b.entry.date.getTime() - a.entry.date.getTime())
    .slice(0, 8)

  const buckets = bucketByUrgency(upcoming.map((e) => e.entry))
  const actionableCount = upcoming.filter((e) => e.entry.actionable).length

  return (
    <Stack gap={26}>
      <Stack gap={6}>
        <Eyebrow>Calendar</Eyebrow>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.022em' }}>What’s coming up</h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: '62ch' }}>
          {actionableCount > 0
            ? `${actionableCount} ${actionableCount === 1 ? 'deadline you need to act on' : 'deadlines you need to act on'}, plus programme dates for context. The two are never mixed together.`
            : 'Deadlines from your applications and saved opportunities appear here.'}
        </p>
      </Stack>

      <Row gap={10}>
        <LinkButton href="/api/calendar.ics" size="sm" external>
          Add to your calendar (.ics)
        </LinkButton>
      </Row>

      {upcoming.length === 0 ? (
        <EmptyState
          icon="▤"
          title="Nothing scheduled"
          description="Save an opportunity or start an application and its dates will show up here, sorted by how soon you need to act."
          action={
            <LinkButton href="/discover" variant="primary" size="sm">
              Find opportunities
            </LinkButton>
          }
        />
      ) : (
        <Stack gap={24}>
          {buckets.map((bucket) => {
            const items = upcoming.filter((e) => e.entry.urgency.level === bucket.key)
            return (
              <Stack key={bucket.key} gap={11}>
                <Row gap={10}>
                  <h2 style={{ fontSize: 16, fontWeight: 650, color: `var(--${bucket.band.token})` }}>
                    {bucket.band.label}
                  </h2>
                  <Tag>
                    {items.length} {items.length === 1 ? 'date' : 'dates'}
                  </Tag>
                </Row>
                <Card padded={false}>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {items.map((item, i) => (
                      <li
                        key={`${item.slug}-${item.entry.kind}-${i}`}
                        style={{
                          padding: '13px 18px',
                          borderTop: i === 0 ? 'none' : '1px solid var(--border-hairline)',
                          display: 'flex',
                          gap: 14,
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <Stack gap={3} style={{ minWidth: 0 }}>
                          <Link
                            href={`/opportunity/${item.slug}`}
                            style={{ fontSize: 14.5, fontWeight: 600, textDecoration: 'none' }}
                          >
                            {item.title}
                          </Link>
                          <Row gap={8}>
                            <span
                              style={{
                                fontSize: 12.5,
                                color: item.entry.actionable ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                                fontWeight: item.entry.actionable ? 600 : 400,
                              }}
                            >
                              {DEADLINE_LABELS[item.entry.kind as DeadlineKind] ?? item.entry.kind}
                            </span>
                            {!item.entry.actionable ? (
                              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>· not something to apply by</span>
                            ) : null}
                            {item.source === 'saved' ? <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>· saved</span> : null}
                          </Row>
                        </Stack>
                        <Row gap={10}>
                          <span className="tabular" style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
                            {formatDate(item.entry.date)}
                          </span>
                          <DeadlineChip band={item.entry.urgency} countdown={item.entry.countdown} />
                        </Row>
                      </li>
                    ))}
                  </ul>
                </Card>
              </Stack>
            )
          })}
        </Stack>
      )}

      {past.length > 0 ? (
        <details>
          <summary style={{ fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer', minHeight: 36 }}>
            Past dates ({past.length})
          </summary>
          <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {past.map((item, i) => (
              <li key={`${item.slug}-past-${i}`} style={{ fontSize: 13.5, color: 'var(--text-tertiary)' }}>
                <span className="tabular">{formatDate(item.entry.date)}</span> · {item.title} ·{' '}
                {DEADLINE_LABELS[item.entry.kind as DeadlineKind] ?? item.entry.kind}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Stack>
  )
}
