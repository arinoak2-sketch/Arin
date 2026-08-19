'use client'

import { useState, useTransition } from 'react'
import { runRetentionPurge } from '@/lib/actions/admin'

/**
 * Retention, made visible.
 *
 * The decision log promises students that discovery logs are purged after 90
 * days. Showing an operator how many rows are currently past that line — and
 * letting them run the purge — is what turns the promise into something
 * checkable rather than something asserted.
 */
export function RetentionPanel({
  dueQueries,
  totalQueries,
  retentionDays,
  oldestQueryAt,
}: {
  dueQueries: number
  totalQueries: number
  retentionDays: number
  oldestQueryAt: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-hairline)',
        borderRadius: 'var(--radius-card)',
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <strong style={{ fontSize: 15, fontWeight: 650 }}>Data retention</strong>
        <span style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          Search history is personal. Lumen promises students it keeps discovery logs for {retentionDays} days and
          then deletes them.
        </span>
      </div>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Stat label="Logs stored" value={String(totalQueries)} />
        <Stat label="Past the window" value={String(dueQueries)} tone={dueQueries > 0 ? 'caution' : undefined} />
        <Stat label="Oldest" value={oldestQueryAt ?? 'none'} />
      </div>

      <div style={{ display: 'flex', gap: 11, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await runRetentionPurge()
              setResult(
                r.discoveryQueriesPurged === 0 && r.notificationsPurged === 0
                  ? 'Nothing was past its retention window.'
                  : `Deleted ${r.discoveryQueriesPurged} search ${r.discoveryQueriesPurged === 1 ? 'log' : 'logs'} and ${r.notificationsPurged} sent ${r.notificationsPurged === 1 ? 'notification' : 'notifications'}.`,
              )
            })
          }
          style={{
            minHeight: 40,
            padding: '9px 15px',
            borderRadius: 'var(--radius-input)',
            border: '1px solid var(--border-strong)',
            background: 'var(--surface-raised)',
            fontSize: 13.5,
            fontWeight: 600,
            cursor: pending ? 'wait' : 'pointer',
          }}
        >
          {pending ? 'Purging…' : 'Run retention purge'}
        </button>
        {result ? (
          <span role="status" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {result}
          </span>
        ) : null}
      </div>

      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
        This also runs from <code>POST /api/cron/maintenance</code> on a schedule. Running it here does the same work.
      </span>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'caution' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 650,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
        }}
      >
        {label}
      </span>
      <span
        className="tabular"
        style={{ fontSize: 17, fontWeight: 700, color: tone ? `var(--${tone})` : 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  )
}
