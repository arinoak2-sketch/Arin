'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { toggleTask } from '@/lib/actions/opportunities'

export function ChecklistItem({
  id,
  title,
  detail,
  isComplete,
  isRequired,
  warning,
}: {
  id: string
  title: string
  detail: string | null
  isComplete: boolean
  isRequired: boolean
  warning?: string
}) {
  const [complete, setComplete] = useState(isComplete)
  const [optimistic, setOptimistic] = useOptimistic(complete)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggle() {
    const next = !optimistic
    setError(null)
    startTransition(async () => {
      setOptimistic(next)
      const result = await toggleTask(id, next)
      if (result.ok) setComplete(next)
      else setError('Could not update that step.')
    })
  }

  return (
    <li style={{ borderTop: '1px solid var(--border-hairline)' }}>
      <label
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          padding: '13px 18px',
          cursor: pending ? 'wait' : 'pointer',
          minHeight: 48,
        }}
      >
        <input
          type="checkbox"
          checked={optimistic}
          onChange={toggle}
          disabled={pending}
          style={{ marginTop: 3, width: 17, height: 17, accentColor: 'var(--accent)', flex: 'none', cursor: 'inherit' }}
        />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            style={{
              fontSize: 14.5,
              fontWeight: 550,
              color: optimistic ? 'var(--text-tertiary)' : 'var(--text-primary)',
              textDecoration: optimistic ? 'line-through' : 'none',
            }}
          >
            {title}
            {!isRequired ? (
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>optional</span>
            ) : null}
          </span>
          {detail ? (
            <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{detail}</span>
          ) : null}
          {warning && !optimistic ? (
            <span style={{ fontSize: 12.5, color: 'var(--soon)', lineHeight: 1.5 }}>{warning}</span>
          ) : null}
          {error ? (
            <span role="alert" style={{ fontSize: 12.5, color: 'var(--urgent)' }}>
              {error}
            </span>
          ) : null}
        </span>
      </label>
    </li>
  )
}
