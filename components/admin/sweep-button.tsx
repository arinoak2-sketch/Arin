'use client'

import { useState, useTransition } from 'react'
import { runExpirySweep } from '@/lib/actions/admin'

export function SweepButton() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await runExpirySweep()
            setResult(
              r.count === 0
                ? 'Nothing to expire — every listing with a deadline is still open.'
                : `${r.count} ${r.count === 1 ? 'listing' : 'listings'} marked expired, each with an audit entry.`,
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
          cursor: 'pointer',
        }}
      >
        {pending ? 'Sweeping…' : 'Run expiry sweep'}
      </button>
      {result ? (
        <span role="status" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {result}
        </span>
      ) : null}
    </span>
  )
}
