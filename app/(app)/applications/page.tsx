import Link from 'next/link'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@/lib/db/enums'
import { triage } from '@/lib/intelligence/deadlines'
import { computeReadiness } from '@/lib/intelligence/readiness'
import { taskUrgency } from '@/lib/intelligence/checklist'
import { Card, EmptyState, Eyebrow, LinkButton, Meter, Row, Stack, Tag } from '@/components/ui/primitives'
import { DeadlineChip } from '@/components/opportunity/indicators'
import { ChecklistItem } from '@/components/application/checklist-item'
import { StatusSelect } from '@/components/application/status-select'

export const metadata = { title: 'Applications' }
export const dynamic = 'force-dynamic'

/**
 * The tracker. One card per application, each showing readiness, the single
 * next blocking action, and the full checklist with lead-time warnings.
 */
export default async function ApplicationsPage() {
  const user = await requireUser()
  const now = new Date()

  const applications = await prisma.application.findMany({
    where: { userId: user.id },
    include: {
      tasks: { orderBy: { sortOrder: 'asc' } },
      opportunity: { select: { id: true, slug: true, title: true, officialUrl: true, applyUrl: true, deadlines: true } },
    },
  })

  const enriched = applications
    .map((app) => {
      const deadlines = triage(app.opportunity.deadlines, now)
      const primary = deadlines.find((d) => d.actionable && d.urgency.level !== 'PASSED') ?? null
      const readiness = computeReadiness(
        app.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          kind: t.kind,
          isRequired: t.isRequired,
          isComplete: t.isComplete,
          blocksSubmission: t.blocksSubmission,
          leadTimeDays: t.leadTimeDays,
        })),
        primary?.date ?? null,
        now,
      )
      return { app, primary, readiness }
    })
    .sort((a, b) => {
      const closed = (s: string) => ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'COMPLETED'].includes(s)
      if (closed(a.app.status) !== closed(b.app.status)) return closed(a.app.status) ? 1 : -1
      return (a.primary?.date.getTime() ?? Infinity) - (b.primary?.date.getTime() ?? Infinity)
    })

  return (
    <Stack gap={26}>
      <Stack gap={6}>
        <Eyebrow>Applications</Eyebrow>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.022em' }}>Your applications</h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: '62ch' }}>
          Each checklist is built from what the organiser actually asks for, ordered so the jobs that depend on other
          people come first.
        </p>
      </Stack>

      {enriched.length === 0 ? (
        <EmptyState
          icon="◑"
          title="Nothing started yet"
          description="Open an opportunity you like and choose “Start application”. Lumen will build the checklist and start warning you before anything gets tight."
          action={
            <LinkButton href="/discover" variant="primary" size="sm">
              Find opportunities
            </LinkButton>
          }
        />
      ) : (
        <Stack gap={18}>
          {enriched.map(({ app, primary, readiness }) => (
            <Card key={app.id} padded={false} style={{ scrollMarginTop: 80 }}>
              <div id={app.id} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Row gap={14} align="flex-start" style={{ justifyContent: 'space-between' }}>
                  <Stack gap={4} style={{ minWidth: 0 }}>
                    <Link
                      href={`/opportunity/${app.opportunity.slug}`}
                      style={{ fontSize: 17, fontWeight: 650, textDecoration: 'none', lineHeight: 1.3 }}
                    >
                      {app.opportunity.title}
                    </Link>
                    <Row gap={9}>
                      <Tag>{APPLICATION_STATUS_LABELS[app.status as ApplicationStatus] ?? app.status}</Tag>
                      {primary ? (
                        <DeadlineChip band={primary.urgency} countdown={primary.countdown} kindLabel={primary.label} />
                      ) : (
                        <Tag>No deadline stated</Tag>
                      )}
                    </Row>
                  </Stack>
                  <StatusSelect applicationId={app.id} status={app.status} />
                </Row>

                <Meter
                  value={readiness.score}
                  label={`${readiness.completed} of ${readiness.total} required steps done`}
                  tone={readiness.behindSchedule.length > 0 ? 'soon' : 'accent'}
                />

                {readiness.behindSchedule.length > 0 ? (
                  <div
                    style={{
                      padding: '11px 13px',
                      borderRadius: 'var(--radius-input)',
                      background: 'var(--soon-wash)',
                      border: '1px solid var(--border-hairline)',
                      borderLeft: '3px solid var(--soon)',
                    }}
                  >
                    <Stack gap={5}>
                      <strong style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--soon)' }}>
                        {readiness.behindSchedule.length === 1 ? 'One step is running late' : `${readiness.behindSchedule.length} steps are running late`}
                      </strong>
                      <span style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {readiness.behindSchedule[0]!.message}
                      </span>
                    </Stack>
                  </div>
                ) : readiness.canSubmit ? (
                  <div
                    style={{
                      padding: '11px 13px',
                      borderRadius: 'var(--radius-input)',
                      background: 'var(--accent-wash)',
                      border: '1px solid var(--accent-line)',
                      fontSize: 13.5,
                      color: 'var(--accent)',
                    }}
                  >
                    Everything required is done. You can submit whenever you are ready.
                  </div>
                ) : readiness.nextAction ? (
                  <span style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
                    Next: <strong style={{ color: 'var(--text-primary)' }}>{readiness.nextAction.title}</strong>
                  </span>
                ) : null}
              </div>

              <ul style={{ margin: 0, padding: 0, listStyle: 'none', borderTop: '1px solid var(--border-hairline)' }}>
                {app.tasks.map((task) => (
                  <ChecklistItem
                    key={task.id}
                    id={task.id}
                    title={task.title}
                    detail={task.detail}
                    isComplete={task.isComplete}
                    isRequired={task.isRequired}
                    warning={
                      taskUrgency(
                        { kind: task.kind, leadTimeDays: task.leadTimeDays, title: task.title, isComplete: task.isComplete },
                        primary?.date ?? null,
                        now,
                      ).message
                    }
                  />
                ))}
              </ul>

              <div
                style={{
                  borderTop: '1px solid var(--border-hairline)',
                  background: 'var(--surface-sunken)',
                  padding: '11px 18px',
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <a
                  href={app.opportunity.applyUrl ?? app.opportunity.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13.5, color: 'var(--accent)', minHeight: 36, display: 'inline-flex', alignItems: 'center' }}
                >
                  Open the organiser’s page ↗
                </a>
              </div>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
