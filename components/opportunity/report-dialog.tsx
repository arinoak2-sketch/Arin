'use client'

import { useState, useTransition } from 'react'
import { reportOpportunity } from '@/lib/actions/opportunities'

const REASONS: Array<{ value: string; label: string }> = [
  { value: 'WRONG_DEADLINE', label: 'The deadline is wrong' },
  { value: 'EXPIRED', label: 'This has already closed' },
  { value: 'WRONG_ELIGIBILITY', label: 'The eligibility is wrong' },
  { value: 'BROKEN_LINK', label: 'The link is broken' },
  { value: 'NOT_REAL', label: 'This does not look real' },
  { value: 'OTHER', label: 'Something else' },
]

/**
 * Reporting takes effect immediately: the listing drops to "needs review"
 * before any human sees the report. One student's report protects the next.
 */
export function ReportDialog({ opportunityId }: { opportunityId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(REASONS[0]!.value)
  const [detail, setDetail] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (done) {
    return (
      <p role="status" style={{ fontSize: 13.5, color: 'var(--accent)' }}>
        Thank you — this listing is now marked as needing review, and a person will check it.
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          alignSelf: 'flex-start',
          background: 'none',
          border: 'none',
          padding: '6px 0',
          minHeight: 36,
          color: 'var(--text-tertiary)',
          fontSize: 13.5,
          textDecoration: 'underline',
          cursor: 'pointer',
        }}
      >
        Report a problem with this listing
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        startTransition(async () => {
          const result = await reportOpportunity(opportunityId, reason, detail)
          if (result.ok) setDone(true)
          else setError(result.error ?? 'Could not send that report.')
        })
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 11,
        padding: 16,
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--surface-raised)',
      }}
    >
      <strong style={{ fontSize: 14.5, fontWeight: 650 }}>What is wrong with this listing?</strong>

      <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <legend style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Reason for the report
        </legend>
        {REASONS.map((r) => (
          <label key={r.value} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, minHeight: 32, cursor: 'pointer' }}>
            <input
              type="radio"
              name="reason"
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
            />
            {r.label}
          </label>
        ))}
      </fieldset>

      <label htmlFor="report-detail" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Anything else that would help (optional)
      </label>
      <textarea
        id="report-detail"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        rows={3}
        maxLength={500}
        style={{
          padding: 11,
          fontSize: 14,
          borderRadius: 'var(--radius-input)',
          border: '1px solid var(--border-strong)',
          background: 'var(--surface-sunken)',
          resize: 'vertical',
        }}
      />

      {error ? (
        <p role="alert" style={{ fontSize: 13, color: 'var(--urgent)' }}>
          {error}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 9 }}>
        <button
          type="submit"
          disabled={pending}
          style={{
            minHeight: 40,
            padding: '9px 15px',
            borderRadius: 'var(--radius-input)',
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--accent-contrast)',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          {pending ? 'Sending…' : 'Send report'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            minHeight: 40,
            padding: '9px 15px',
            borderRadius: 'var(--radius-input)',
            border: '1px solid var(--border-strong)',
            background: 'var(--surface-raised)',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
