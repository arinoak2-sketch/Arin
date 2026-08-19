'use client'

import { useState, useTransition } from 'react'
import { setApplicationStatus } from '@/lib/actions/opportunities'
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@/lib/db/enums'

export function StatusSelect({ applicationId, status }: { applicationId: string; status: string }) {
  const [value, setValue] = useState(status)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
      <label htmlFor={`status-${applicationId}`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        Application status
      </label>
      <select
        id={`status-${applicationId}`}
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value
          const previous = value
          setValue(next)
          setError(null)
          startTransition(async () => {
            const result = await setApplicationStatus(applicationId, next)
            if (!result.ok) {
              setValue(previous)
              setError('Could not change the status.')
            }
          })
        }}
        style={{
          minHeight: 40,
          padding: '8px 11px',
          borderRadius: 'var(--radius-input)',
          border: '1px solid var(--border-strong)',
          background: 'var(--surface-raised)',
          fontSize: 13.5,
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        {APPLICATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {APPLICATION_STATUS_LABELS[s as ApplicationStatus]}
          </option>
        ))}
      </select>
      {error ? (
        <span role="alert" style={{ fontSize: 12, color: 'var(--urgent)' }}>
          {error}
        </span>
      ) : null}
    </span>
  )
}
