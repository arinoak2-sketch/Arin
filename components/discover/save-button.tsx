'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { setSavedState, unsave } from '@/lib/actions/opportunities'

/**
 * Saving should feel instant, because it is the one interaction a student
 * performs dozens of times. Optimistic state flips immediately and rolls back
 * with a visible message if the server disagrees.
 */
export function SaveButton({ opportunityId, initialSaved }: { opportunityId: string; initialSaved: boolean }) {
  const [saved, setSaved] = useState(initialSaved)
  const [optimisticSaved, setOptimisticSaved] = useOptimistic(saved)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggle() {
    const next = !optimisticSaved
    setError(null)
    startTransition(async () => {
      setOptimisticSaved(next)
      const result = next ? await setSavedState(opportunityId, 'SAVED') : await unsave(opportunityId)
      if (result.ok) {
        setSaved(next)
      } else {
        setError('Could not save that — try again.')
      }
    })
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {error ? (
        <span role="alert" style={{ fontSize: 12, color: 'var(--urgent)' }}>
          {error}
        </span>
      ) : null}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={optimisticSaved}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          minHeight: 36,
          padding: '7px 13px',
          borderRadius: 'var(--radius-pill)',
          border: `1px solid ${optimisticSaved ? 'var(--accent)' : 'var(--border-strong)'}`,
          background: optimisticSaved ? 'var(--accent-wash)' : 'var(--surface-raised)',
          color: optimisticSaved ? 'var(--accent)' : 'var(--text-secondary)',
          fontSize: 13,
          fontWeight: 600,
          cursor: pending ? 'wait' : 'pointer',
          transition: 'background 120ms ease, border-color 120ms ease, transform 120ms ease',
          transform: optimisticSaved ? 'scale(1)' : 'scale(1)',
        }}
      >
        <span aria-hidden="true">{optimisticSaved ? '★' : '☆'}</span>
        {optimisticSaved ? 'Saved' : 'Save'}
      </button>
    </span>
  )
}
