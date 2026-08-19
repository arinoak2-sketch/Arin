import Link from 'next/link'
import type { VerificationState } from '@/lib/db/enums'
import type { RankedOpportunity } from '@/lib/repo/opportunities'
import { Card, Row, Stack, Tag } from '@/components/ui/primitives'
import { DeadlineChip, MatchBadge, ReasonList, VerificationBadge } from '@/components/opportunity/indicators'
import { SaveButton } from './save-button'

/**
 * The opportunity card — the unit a student actually makes decisions from.
 *
 * Its job is to answer, at a glance: can I enter, is it worth my time, when is
 * it due, and how much does Lumen actually know about it.
 */
export function OpportunityCard({
  item,
  saved,
  showReasons = true,
}: {
  item: RankedOpportunity
  saved?: boolean
  showReasons?: boolean
}) {
  const { record, match, primaryDeadline } = item

  // Lead with what fits, then the caveats. A student deciding whether to spend
  // a weekend on this needs the concerns before they start, not after.
  const positives = match.reasons.filter((r) => r.verdict === 'MATCH').slice(0, 3)
  const concerns = match.reasons.filter((r) => r.verdict === 'PARTIAL' || r.verdict === 'MISMATCH').slice(0, 2)
  const reasons = [...positives, ...concerns]

  const organiser = record.organization?.name ?? hostOf(record.officialUrl)

  return (
    <Card as="article" padded={false} style={{ overflow: 'hidden' }}>
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Stack gap={3} style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 16.5, fontWeight: 650, lineHeight: 1.3 }}>
              <Link href={`/opportunity/${record.slug}`} style={{ textDecoration: 'none' }}>
                {record.title}
              </Link>
            </h3>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{organiser}</span>
          </Stack>
          <MatchBadge score={match.score} confidence={match.confidence} eligible={match.eligible} />
        </div>

        {!match.eligible && match.ineligibleReasons.length > 0 ? (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-input)',
              background: 'var(--passed-wash)',
              border: '1px solid var(--border-hairline)',
              fontSize: 13.5,
              color: 'var(--text-secondary)',
            }}
          >
            {match.ineligibleReasons[0]!.humanText}
          </div>
        ) : showReasons && reasons.length > 0 ? (
          <ReasonList reasons={reasons} />
        ) : null}

        <Row gap={7}>
          {record.categories.slice(0, 2).map((c) => (
            <Tag key={c.categoryId}>{c.category.label}</Tag>
          ))}
          {record.format !== 'UNKNOWN' ? <Tag>{formatLabel(record.format)}</Tag> : null}
          <Tag>{costLabel(record)}</Tag>
          {primaryDeadline ? (
            <DeadlineChip band={primaryDeadline.urgency} countdown={primaryDeadline.countdown} />
          ) : (
            <Tag>No deadline stated</Tag>
          )}
        </Row>
      </div>

      <div
        style={{
          borderTop: '1px solid var(--border-hairline)',
          background: 'var(--surface-sunken)',
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <Row gap={10}>
          <VerificationBadge
            state={record.verificationState as VerificationState}
            lastVerifiedAt={record.lastVerifiedAt}
          />
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {record.sources.length} {record.sources.length === 1 ? 'source' : 'sources'}
          </span>
        </Row>
        <SaveButton opportunityId={record.id} initialSaved={saved ?? false} />
      </div>
    </Card>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Unknown organiser'
  }
}

function formatLabel(format: string): string {
  return format === 'IN_PERSON' ? 'In person' : format === 'ONLINE' ? 'Online' : 'Hybrid'
}

function costLabel(record: { costType: string; costAmount: number | null; costCurrency: string | null }): string {
  switch (record.costType) {
    case 'FREE':
      return 'Free'
    case 'FREE_WITH_AID':
      return 'Paid · aid available'
    case 'PAID':
      return record.costAmount !== null
        ? `${record.costCurrency ?? ''} ${record.costAmount}`.trim()
        : 'Paid'
    default:
      // Never "Free" by default. An unstated cost is unstated.
      return 'Cost not stated'
  }
}
