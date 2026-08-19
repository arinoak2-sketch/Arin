import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { decodeRequirements, decodeStatedBenefits } from '@/lib/db/codec'
import { DEADLINE_LABELS, type DeadlineKind, type VerificationState } from '@/lib/db/enums'
import { assessWorth, buildBenefits } from '@/lib/intelligence/benefits'
import { loadOpportunityDetail, loadProfile } from '@/lib/repo/opportunities'
import { toScorableOpportunity, opportunityInclude } from '@/lib/repo/mappers'
import {
  Card,
  Eyebrow,
  LinkButton,
  Row,
  SectionHeading,
  Stack,
  Tag,
} from '@/components/ui/primitives'
import {
  BenefitTierLabel,
  DeadlineChip,
  formatDate,
  MatchBadge,
  ProvenanceChip,
  ReasonList,
  VerificationBadge,
  verificationHelp,
} from '@/components/opportunity/indicators'
import { ApplyBar } from '@/components/application/apply-bar'
import { ReportDialog } from '@/components/opportunity/report-dialog'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const record = await prisma.opportunity.findUnique({ where: { slug }, select: { title: true } })
  return { title: record?.title ?? 'Opportunity' }
}

export default async function OpportunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser()
  const { slug } = await params
  const now = new Date()

  const profile = await loadProfile(user.id)
  const detail = await loadOpportunityDetail(slug, profile, now)
  if (!detail) notFound()

  const { record, match, deadlines, provenance, verifications } = detail
  const full = await prisma.opportunity.findUnique({ where: { slug }, include: opportunityInclude })
  if (!full) notFound()

  const [saved, application] = await Promise.all([
    prisma.savedOpportunity.findUnique({
      where: { userId_opportunityId: { userId: user.id, opportunityId: record.id } },
      select: { state: true },
    }),
    prisma.application.findUnique({
      where: { userId_opportunityId: { userId: user.id, opportunityId: record.id } },
      select: { id: true, status: true },
    }),
  ])

  const requirements = decodeRequirements(record.requirements)
  const statedBenefits = decodeStatedBenefits(record.statedBenefits)
  const scorable = toScorableOpportunity(full)
  const benefits = buildBenefits(scorable, profile, statedBenefits)
  const worth = assessWorth(scorable, profile, requirements.length, match.score)

  const positives = match.reasons.filter((r) => r.verdict === 'MATCH')
  const concerns = match.reasons.filter((r) => r.verdict === 'PARTIAL' || r.verdict === 'MISMATCH')
  const unknowns = match.reasons.filter((r) => r.verdict === 'UNKNOWN')
  const organiser = record.organization?.name ?? hostOf(record.officialUrl)
  const primary = deadlines.find((d) => d.actionable && d.urgency.level !== 'PASSED')

  return (
    <Stack gap={30} style={{ paddingBottom: 88 }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Stack gap={14}>
        <Row gap={9}>
          {record.categories.map((c) => (
            <Tag key={c.categoryId}>{c.category.label}</Tag>
          ))}
          {record.cycleLabel ? <Tag>{record.cycleLabel}</Tag> : null}
        </Row>

        <Row gap={20} align="flex-start" style={{ justifyContent: 'space-between' }}>
          <Stack gap={6} style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(24px, 4vw, 33px)', fontWeight: 700, lineHeight: 1.12, letterSpacing: '-0.024em' }}>
              {record.title}
            </h1>
            <Row gap={9}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{organiser}</span>
              {provenance.organizerName ? (
                <ProvenanceChip provenance={provenance.organizerName} field="organiser" />
              ) : null}
            </Row>
          </Stack>
          <MatchBadge score={match.score} confidence={match.confidence} eligible={match.eligible} />
        </Row>

        <Row gap={9}>
          <VerificationBadge state={record.verificationState as VerificationState} lastVerifiedAt={record.lastVerifiedAt} />
          {primary ? <DeadlineChip band={primary.urgency} countdown={primary.countdown} kindLabel={primary.label} /> : null}
        </Row>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: '66ch', lineHeight: 1.55 }}>
          {verificationHelp(record.verificationState as VerificationState)}
        </p>
      </Stack>

      {/* ── Eligibility verdict ───────────────────────────────────────────── */}
      {!match.eligible ? (
        <Card style={{ borderLeft: '3px solid var(--urgent)' }}>
          <Stack gap={10}>
            <strong style={{ fontSize: 16, fontWeight: 650 }}>You are not eligible for this one</strong>
            <ReasonList reasons={match.ineligibleReasons} />
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              Lumen reads eligibility from the official page. If you think this is wrong, check the source and report
              it — the wording it used is quoted above.
            </p>
          </Stack>
        </Card>
      ) : null}

      {/* ── Why this matches you ──────────────────────────────────────────── */}
      {match.eligible && positives.length > 0 ? (
        <Stack gap={12}>
          <SectionHeading eyebrow="Match" title="Why this matches you" />
          <Card>
            <ReasonList reasons={positives} />
          </Card>
        </Stack>
      ) : null}

      {/* ── Worth knowing ─────────────────────────────────────────────────── */}
      {concerns.length > 0 ? (
        <Stack gap={12}>
          <SectionHeading
            eyebrow="Before you start"
            title="Worth knowing"
            description="Surfaced now rather than after you have spent a weekend on the application."
          />
          <Card style={{ borderLeft: '3px solid var(--soon)' }}>
            <ReasonList reasons={concerns} />
          </Card>
        </Stack>
      ) : null}

      {/* ── Overview ──────────────────────────────────────────────────────── */}
      {record.summary ? (
        <Stack gap={12}>
          <SectionHeading eyebrow="Overview" title="What it is" />
          <Card>
            <Stack gap={9}>
              <p style={{ fontSize: 15, lineHeight: 1.62, color: 'var(--text-secondary)', maxWidth: '68ch' }}>
                {record.summary}
              </p>
              {provenance.summary ? <ProvenanceChip provenance={provenance.summary} field="description" /> : null}
            </Stack>
          </Card>
        </Stack>
      ) : null}

      {/* ── Key facts ─────────────────────────────────────────────────────── */}
      <Stack gap={12}>
        <SectionHeading eyebrow="Facts" title="The essentials" />
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <Fact label="Cost" value={costLabel(record)} provenanceKey="costType" provenance={provenance} />
          <Fact label="Format" value={formatLabel(record.format)} provenanceKey="format" provenance={provenance} />
          <Fact
            label="Location"
            value={
              record.format === 'ONLINE'
                ? 'Anywhere'
                : [record.locationCity, record.locationCountry].filter(Boolean).join(', ') || 'Not stated'
            }
            provenanceKey="locationCountry"
            provenance={provenance}
          />
          <Fact label="Duration" value={record.durationText ?? (record.durationDays ? `${record.durationDays} days` : 'Not stated')} />
          <Fact label="Competition level" value={record.competitionLevel ?? 'Not stated'} />
          <Fact label="First found by Lumen" value={formatDate(record.firstSeenAt)} />
        </div>
      </Stack>

      {/* ── Dates ─────────────────────────────────────────────────────────── */}
      <Stack gap={12}>
        <SectionHeading
          eyebrow="Dates"
          title="Key dates"
          description="Application deadlines and programme dates are listed separately and never merged."
        />
        {deadlines.length === 0 ? (
          <Card>
            <p style={{ fontSize: 14.5, color: 'var(--text-secondary)' }}>
              No dates are stated on the source page. Check the official page before planning around this one.
            </p>
          </Card>
        ) : (
          <Card padded={false}>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {deadlines.map((d, i) => (
                <li
                  key={`${d.kind}-${i}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 14,
                    flexWrap: 'wrap',
                    padding: '13px 18px',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border-hairline)',
                  }}
                >
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>
                      {DEADLINE_LABELS[d.kind as DeadlineKind] ?? d.kind}
                    </span>
                    {d.rawText ? (
                      <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>Source says: “{d.rawText}”</span>
                    ) : null}
                  </Stack>
                  <Row gap={10}>
                    {d.isRollingAdmission ? (
                      <Tag>Rolling — no fixed date</Tag>
                    ) : (
                      <>
                        <span className="tabular" style={{ fontSize: 14 }}>
                          {formatDate(d.date)}
                        </span>
                        <DeadlineChip band={d.urgency} countdown={d.countdown} />
                      </>
                    )}
                  </Row>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Stack>

      {/* ── Why it could be valuable ──────────────────────────────────────── */}
      <Stack gap={12}>
        <SectionHeading
          eyebrow="Value"
          title="Why this could be worth doing"
          description="Every line is labelled with where it comes from: the organiser, the format, or Lumen's own reading."
        />
        <Stack gap={10}>
          {benefits.map((benefit, i) => (
            <Card key={i}>
              <Stack gap={8}>
                <BenefitTierLabel tier={benefit.tier} />
                <p style={{ fontSize: 14.5, lineHeight: 1.58, color: 'var(--text-secondary)', maxWidth: '68ch' }}>
                  {benefit.text}
                </p>
                {benefit.rawText ? (
                  <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>Quoted from the source: “{benefit.rawText}”</span>
                ) : null}
              </Stack>
            </Card>
          ))}
        </Stack>
      </Stack>

      {/* ── Is it worth my time ───────────────────────────────────────────── */}
      <Stack gap={12}>
        <SectionHeading eyebrow="Decision" title="Is it worth your time?" />
        <Card>
          <Stack gap={14}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
              <Stat label="Time commitment" value={titleise(worth.timeCommitment)} />
              <Stat label="Application effort" value={titleise(worth.applicationEffort)} />
              <Stat label="Cost" value={worth.costLabel} />
              <Stat label="Skill relevance" value={titleise(worth.skillRelevance)} />
            </div>
            <div
              style={{
                padding: '13px 15px',
                borderRadius: 'var(--radius-input)',
                background: 'var(--caution-wash)',
                border: '1px solid var(--border-hairline)',
              }}
            >
              <Stack gap={7}>
                <BenefitTierLabel tier="INTERPRETED" />
                <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{worth.assessment}</p>
              </Stack>
            </div>
          </Stack>
        </Card>
      </Stack>

      {/* ── What you'll need ──────────────────────────────────────────────── */}
      <Stack gap={12}>
        <SectionHeading eyebrow="Application" title="What you’ll need" />
        {requirements.length === 0 ? (
          <Card>
            <p style={{ fontSize: 14.5, color: 'var(--text-secondary)' }}>
              The source page does not list what applicants must submit. Starting an application here will still give
              you a basic checklist, and you can add your own steps.
            </p>
          </Card>
        ) : (
          <Card padded={false}>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {requirements.map((req, i) => (
                <li
                  key={i}
                  style={{ padding: '13px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--border-hairline)' }}
                >
                  <Stack gap={3}>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>{req.label}</span>
                    {req.rawText ? (
                      <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>Source says: “{req.rawText}”</span>
                    ) : null}
                  </Stack>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Stack>

      {/* ── Unknowns ──────────────────────────────────────────────────────── */}
      {unknowns.length > 0 ? (
        <Stack gap={12}>
          <SectionHeading
            eyebrow="Gaps"
            title="What Lumen could not determine"
            description="These were left out of the match score entirely rather than guessed at."
          />
          <Card style={{ background: 'var(--surface-sunken)' }}>
            <ReasonList reasons={unknowns} />
          </Card>
        </Stack>
      ) : null}

      {/* ── Sources ───────────────────────────────────────────────────────── */}
      <Stack gap={12}>
        <SectionHeading eyebrow="Provenance" title="Where this came from" />
        <Card padded={false}>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {record.sources.map((source, i) => (
              <li
                key={source.id}
                style={{ padding: '13px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--border-hairline)' }}
              >
                <Row gap={10} style={{ justifyContent: 'space-between' }}>
                  <Stack gap={3} style={{ minWidth: 0 }}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 14, color: 'var(--accent)', wordBreak: 'break-word' }}
                    >
                      {source.domain}
                    </a>
                    <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                      {source.fetchedAt ? `Read ${formatDate(source.fetchedAt)}` : 'Not yet fetched'}
                    </span>
                  </Stack>
                  {source.isOfficial ? <Tag>Official</Tag> : <Tag>Secondary</Tag>}
                </Row>
              </li>
            ))}
          </ul>
        </Card>
        {verifications.length > 0 ? (
          <details>
            <summary style={{ fontSize: 13.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Verification history ({verifications.length})
            </summary>
            <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {verifications.map((v) => (
                <li key={v.id} style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                  <span className="tabular">{formatDate(v.createdAt)}</span> · {v.actor.toLowerCase()} ·{' '}
                  {v.action.toLowerCase().replace(/_/g, ' ')}
                  {v.note ? ` — ${v.note}` : ''}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <ReportDialog opportunityId={record.id} />
      </Stack>

      <ApplyBar
        opportunityId={record.id}
        slug={record.slug}
        officialUrl={record.applyUrl ?? record.officialUrl}
        initialSaved={saved?.state === 'SAVED' || saved?.state === 'CONSIDERING'}
        applicationStatus={application?.status ?? null}
        eligible={match.eligible}
      />
    </Stack>
  )
}

function Fact({
  label,
  value,
  provenanceKey,
  provenance,
}: {
  label: string
  value: string
  provenanceKey?: string
  provenance?: Record<string, import('@/lib/discovery/provenance').FieldProvenance>
}) {
  const p = provenanceKey && provenance ? provenance[provenanceKey] : undefined
  return (
    <Card>
      <Stack gap={5}>
        <Eyebrow>{label}</Eyebrow>
        <span style={{ fontSize: 15.5, fontWeight: 600 }}>{value}</span>
        {p ? <ProvenanceChip provenance={p} field={label.toLowerCase()} /> : null}
      </Stack>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={4}>
      <Eyebrow>{label}</Eyebrow>
      <span style={{ fontSize: 15, fontWeight: 650 }}>{value}</span>
    </Stack>
  )
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

function costLabel(record: { costType: string; costAmount: number | null; costCurrency: string | null }): string {
  switch (record.costType) {
    case 'FREE':
      return 'Free'
    case 'FREE_WITH_AID':
      return 'Paid — aid available'
    case 'PAID':
      return record.costAmount !== null ? `${record.costCurrency ?? ''} ${record.costAmount}`.trim() : 'Paid'
    default:
      return 'Not stated'
  }
}
