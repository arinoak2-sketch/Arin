'use client'

import { useState, useTransition } from 'react'
import { approveOpportunity, archiveOpportunity } from '@/lib/actions/admin'

export function ReviewActions({ opportunityId }: { opportunityId: string }) {
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState<'approved' | 'archived' | null>(null)

  if (done) {
    return (
      <p role="status" style={{ fontSize: 13.5, color: done === 'approved' ? 'var(--accent)' : 'var(--text-tertiary)' }}>
        {done === 'approved'
          ? 'Marked verified. Students now see today’s date as the last check.'
          : 'Archived — no longer shown to students.'}
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What did you check? (optional, kept in the audit trail)"
        aria-label="Reviewer note"
        style={{
          flex: '1 1 240px',
          minHeight: 40,
          padding: '9px 11px',
          fontSize: 13.5,
          borderRadius: 'var(--radius-input)',
          border: '1px solid var(--border-strong)',
          background: 'var(--surface-sunken)',
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await approveOpportunity(opportunityId, note)
            setDone('approved')
          })
        }
        style={{
          minHeight: 40,
          padding: '9px 15px',
          borderRadius: 'var(--radius-input)',
          border: 'none',
          background: 'var(--accent)',
          color: 'var(--accent-contrast)',
          fontWeight: 600,
          fontSize: 13.5,
          cursor: 'pointer',
        }}
      >
        Confirm against source
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await archiveOpportunity(opportunityId, note)
            setDone('archived')
          })
        }
        style={{
          minHeight: 40,
          padding: '9px 15px',
          borderRadius: 'var(--radius-input)',
          border: '1px solid var(--urgent)',
          background: 'var(--urgent-wash)',
          color: 'var(--urgent)',
          fontWeight: 600,
          fontSize: 13.5,
          cursor: 'pointer',
        }}
      >
        Archive
      </button>
    </div>
  )
}
