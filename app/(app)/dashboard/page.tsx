import Link from 'next/link'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { searchCapability } from '@/lib/config'
import { emptyFilters } from '@/lib/discovery/queryPlanner'
import { triage } from '@/lib/intelligence/deadlines'
import { computeReadiness, reminderText } from '@/lib/intelligence/readiness'
import { loadProfile, loadSavedIds, searchCorpus } from '@/lib/repo/opportunities'
import { profileCompleteness } from '@/lib/intelligence/completeness'
import {
  Card,
  EmptyState,
  Eyebrow,
  LinkButton,
  Meter,
  Row,
  SectionHeading,
  Stack,
  UnavailableNotice,
} from '@/components/ui/primitives'
import { DeadlineChip } from '@/components/opportunity/indicators'
import { OpportunityCard } from '@/components/discover/opportunity-card'

export const metadata = { title: 'Today' }
export const dynamic = 'force-dynamic'

/**
 * The dashboard answers one question: what should I do today?
 *
 * It is ordered by urgency rather than by section, so the thing that matters
 * most is always first regardless of which category it belongs to.
 */
export default async function DashboardPage() {
  const user = await requireUser()
  const now = new Date()

  const [profileRecord, profile, applications, savedIds] = await Promise.all([
    prisma.studentProfile.findUnique({ where: { userId: user.id } }),
    loadProfile(user.id),
    prisma.application.findMany({
      where: { userId: user.id, status: { notIn: ['REJECTED', 'WITHDRAWN', 'COMPLETED'] } },
      include: { tasks: true, opportunity: { select: { id: true, slug: true, title: true, deadlines: true } } },
    }),
    loadSavedIds(user.id),
  ])

  const completeness = profileCompleteness(profileRecord, profile)

  // Each in-progress application, with its next blocking action worked out.
  const live = applications
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
      return { app, primary, readiness, reminder: reminderText(app.opportunity.title, readiness, primary?.date ?? null, now) }
    })
    .sort((a, b) => (a.primary?.date.getTime() ?? Infinity) - (b.primary?.date.getTime() ?? Infinity))

  // "Needs action today" is deliberately narrow: behind schedule, or ≤3 days out.
  const needsAction = live.filter(
    (l) => l.readiness.behindSchedule.length > 0 || (l.primary && l.primary.urgency.level === 'URGENT'),
  )
  const dueThisWeek = live.filter((l) => l.primary && ['URGENT', 'SOON'].includes(l.primary.urgency.level))

  const topMatches = profile.age !== null || profile.interests.length > 0
    ? await searchCorpus({ filters: emptyFilters(), profile, userId: user.id, limit: 3, now })
    : []

  const search = searchCapability()
  const firstName = (user.name ?? '').split(' ')[0]

  return (
    <Stack gap={34}>
      <Stack gap={6}>
        <Eyebrow>{formatToday(now)}</Eyebrow>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.022em' }}>
          {firstName ? `${greeting(now)}, ${firstName}` : greeting(now)}
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{summaryLine(needsAction.length, dueThisWeek.length, live.length)}</p>
      </Stack>

      {/* 1 — Needs action today */}
      {needsAction.length > 0 ? (
        <Stack gap={14}>
          <SectionHeading
            eyebrow="Needs action"
            title={needsAction.length === 1 ? 'One thing needs you today' : `${needsAction.length} things need you today`}
            description="These are either already behind their comfortable start date, or close enough to the deadline that waiting is a risk."
          />
          <Stack gap={12} style={{ margin: 0 }}>
            {needsAction.map(({ app, primary, readiness, reminder }) => (
              <Card key={app.id} style={{ borderLeft: '3px solid var(--urgent)' }}>
                <Stack gap={11}>
                  <Row gap={12} align="flex-start" style={{ justifyContent: 'space-between' }}>
                    <Stack gap={3} style={{ minWidth: 0 }}>
                      <Link href={`/applications#${app.id}`} style={{ fontSize: 16, fontWeight: 650, textDecoration: 'none' }}>
                        {app.opportunity.title}
                      </Link>
                      {reminder ? (
                        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{reminder}</p>
                      ) : null}
                    </Stack>
                    {primary ? <DeadlineChip band={primary.urgency} countdown={primary.countdown} /> : null}
                  </Row>
                  <Meter value={readiness.score} label={`${readiness.completed} of ${readiness.total} steps done`} />
                  {readiness.nextAction ? (
                    <Row gap={10} style={{ justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
                        Next: <strong style={{ color: 'var(--text-primary)' }}>{readiness.nextAction.title}</strong>
                      </span>
                      <LinkButton href="/applications" size="sm" variant="primary">
                        Open checklist
                      </LinkButton>
                    </Row>
                  ) : null}
                </Stack>
              </Card>
            ))}
          </Stack>
        </Stack>
      ) : null}

      {/* 2 — Applications in progress */}
      <Stack gap={14}>
        <SectionHeading
          eyebrow="In progress"
          title="Your applications"
          action={live.length > 0 ? <LinkButton href="/applications" size="sm">View all</LinkButton> : undefined}
        />
        {live.length === 0 ? (
          <EmptyState
            icon="◑"
            title="No applications started yet"
            description="When you find something worth applying for, starting an application here builds you a checklist from what the organiser asks for — longest job first."
            action={<LinkButton href="/discover" variant="primary" size="sm">Find opportunities</LinkButton>}
          />
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {live.slice(0, 4).map(({ app, primary, readiness }) => (
              <Card key={app.id}>
                <Stack gap={10}>
                  <Stack gap={3}>
                    <Link href="/applications" style={{ fontSize: 15, fontWeight: 650, textDecoration: 'none' }}>
                      {app.opportunity.title}
                    </Link>
                    {primary ? (
                      <span style={{ fontSize: 12.5, color: `var(--${primary.urgency.token})` }}>
                        {primary.label} · {primary.countdown}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>No deadline stated</span>
                    )}
                  </Stack>
                  <Meter value={readiness.score} label="Ready" />
                  {readiness.nextAction ? (
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      Next: {readiness.nextAction.title}
                    </span>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--accent)' }}>Everything done — ready to submit.</span>
                  )}
                </Stack>
              </Card>
            ))}
          </div>
        )}
      </Stack>

      {/* 3 — Top matches */}
      <Stack gap={14}>
        <SectionHeading
          eyebrow="For you"
          title="Top matches"
          description="Scored against your profile, with the reasons shown. Nothing here is sponsored."
          action={<LinkButton href="/discover" size="sm">Discover more</LinkButton>}
        />
        {!search.available ? <UnavailableNotice title="Live discovery is off" reason={search.reason!} /> : null}
        {topMatches.length === 0 ? (
          <EmptyState
            icon="◈"
            title={completeness.score < 40 ? 'Tell Lumen a little about you' : 'Nothing in the corpus matches yet'}
            description={
              completeness.score < 40
                ? 'Matching needs at least your age, country and a couple of interests. It takes about two minutes and you can change it any time.'
                : 'Lumen has not yet found opportunities matching your profile. Try a search — it will look on the live web and keep whatever it finds.'
            }
            action={
              <LinkButton href={completeness.score < 40 ? '/profile' : '/discover'} variant="primary" size="sm">
                {completeness.score < 40 ? 'Complete your profile' : 'Search the web'}
              </LinkButton>
            }
          />
        ) : (
          <div className="stagger" style={{ display: 'grid', gap: 14 }}>
            {topMatches.map((item) => (
              <div key={item.record.id} className="animate-rise">
                <OpportunityCard item={item} saved={savedIds.has(item.record.id)} />
              </div>
            ))}
          </div>
        )}
      </Stack>

      {/* 4 — Profile nudge, only when it would actually change the matching */}
      {completeness.score < 100 && completeness.nextField ? (
        <Card style={{ background: 'var(--accent-wash)', borderColor: 'var(--accent-line)' }}>
          <Stack gap={10}>
            <Row gap={12} style={{ justifyContent: 'space-between' }}>
              <Stack gap={3} style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 15, fontWeight: 650 }}>{completeness.nextField.prompt}</strong>
                <span style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{completeness.nextField.unlocks}</span>
              </Stack>
              <LinkButton href="/profile" variant="primary" size="sm">
                Add it
              </LinkButton>
            </Row>
            <Meter value={completeness.score} label="Profile completeness" />
          </Stack>
        </Card>
      ) : null}
    </Stack>
  )
}

function greeting(now: Date): string {
  const hour = now.getUTCHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatToday(now: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(now)
}

function summaryLine(needsAction: number, dueThisWeek: number, live: number): string {
  if (needsAction > 0) {
    return `${needsAction} ${needsAction === 1 ? 'application needs' : 'applications need'} attention now${
      dueThisWeek > needsAction ? `, and ${dueThisWeek} ${dueThisWeek === 1 ? 'closes' : 'close'} this week.` : '.'
    }`
  }
  if (dueThisWeek > 0) {
    return `${dueThisWeek} ${dueThisWeek === 1 ? 'application closes' : 'applications close'} this week, and you're on track with all of them.`
  }
  if (live > 0) return `${live} ${live === 1 ? 'application' : 'applications'} in progress, nothing urgent today.`
  return 'Nothing is due. A good day to find something new.'
}
