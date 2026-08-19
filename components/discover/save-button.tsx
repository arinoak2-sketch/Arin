'use client'

import { useFormStatus } from 'react-dom'
import { toggleSavedForm } from '@/lib/actions/opportunities'

/**
 * Saving, as a real form post.
 *
 * The mechanism is the form, not the click handler, so the button works from
 * the moment the HTML arrives rather than from the moment React hydrates. On a
 * slow phone that is the difference between "saved" and a button that appears
 * to do nothing.
 *
 * useFormStatus gives the pending state for free, and the label flips to the
 * target state immediately so it still feels instant.
 */
export function SaveButton({ opportunityId, initialSaved }: { opportunityId: string; initialSaved: boolean }) {
  return (
    <form action={toggleSavedForm} style={{ display: 'inline-flex' }}>
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="desired" value={initialSaved ? 'REMOVE' : 'SAVE'} />
      <SaveSubmit saved={initialSaved} />
    </form>
  )
}

function SaveSubmit({ saved }: { saved: boolean }) {
  const { pending } = useFormStatus()
  // While the post is in flight, show where it is going, not where it was.
  const showSaved = pending ? !saved : saved

  return (
    <button
      type="submit"
      aria-pressed={showSaved}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        minHeight: 36,
        padding: '7px 13px',
        borderRadius: 'var(--radius-pill)',
        border: `1px solid ${showSaved ? 'var(--accent)' : 'var(--border-strong)'}`,
        background: showSaved ? 'var(--accent-wash)' : 'var(--surface-raised)',
        color: showSaved ? 'var(--accent)' : 'var(--text-secondary)',
        fontSize: 13,
        fontWeight: 600,
        cursor: pending ? 'wait' : 'pointer',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
    >
      <span aria-hidden="true">{showSaved ? '★' : '☆'}</span>
      {showSaved ? 'Saved' : 'Save'}
    </button>
  )
}
