'use client'

import { useActionState } from 'react'
import { reportOpportunityForm, type ReportResult } from '@/lib/actions/opportunities'

/**
 * Reporting a problem.
 *
 * The disclosure is a native <details>, so it opens without JavaScript, and the
 * form posts to a server action, so it submits without JavaScript. Reporting a
 * wrong deadline is precisely the thing a student does the moment they notice
 * something is off — it must not depend on the page having finished loading.
 *
 * A report takes effect immediately: the listing drops to "needs review" before
 * any human sees it. One student's report protects the next.
 */

const REASONS: Array<{ value: string; label: string }> = [
  { value: 'WRONG_DEADLINE', label: 'The deadline is wrong' },
  { value: 'EXPIRED', label: 'This has already closed' },
  { value: 'WRONG_ELIGIBILITY', label: 'The eligibility is wrong' },
  { value: 'BROKEN_LINK', label: 'The link is broken' },
  { value: 'NOT_REAL', label: 'This does not look real' },
  { value: 'OTHER', label: 'Something else' },
]

const INITIAL: ReportResult | null = null

export function ReportDialog({ opportunityId }: { opportunityId: string }) {
  const [result, action, pending] = useActionState(reportOpportunityForm, INITIAL)

  if (result?.ok) {
    return (
      <p role="status" style={{ fontSize: 13.5, color: 'var(--accent)', lineHeight: 1.55 }}>
        Thank you — this listing is now marked as needing review, and a person will check it.
      </p>
    )
  }

  return (
    <details style={{ alignSelf: 'flex-start' }} open={result?.ok === false}>
      <summary
        style={{
          cursor: 'pointer',
          minHeight: 36,
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: 13.5,
          color: 'var(--text-tertiary)',
          textDecoration: 'underline',
        }}
      >
        Report a problem with this listing
      </summary>

      <form
        action={action}
        style={{
          marginTop: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 11,
          padding: 16,
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-card)',
          background: 'var(--surface-raised)',
          maxWidth: 460,
        }}
      >
        <input type="hidden" name="opportunityId" value={opportunityId} />

        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <legend style={{ fontSize: 14.5, fontWeight: 650, padding: 0, marginBottom: 4 }}>
            What is wrong with this listing?
          </legend>
          {REASONS.map((r, i) => (
            <label
              key={r.value}
              style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, minHeight: 32, cursor: 'pointer' }}
            >
              <input type="radio" name="reason" value={r.value} defaultChecked={i === 0} />
              {r.label}
            </label>
          ))}
        </fieldset>

        <label htmlFor={`report-detail-${opportunityId}`} style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Anything else that would help (optional)
        </label>
        <textarea
          id={`report-detail-${opportunityId}`}
          name="detail"
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

        {result?.error ? (
          <p role="alert" style={{ fontSize: 13, color: 'var(--urgent)' }}>
            {result.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          style={{
            alignSelf: 'flex-start',
            minHeight: 44,
            padding: '11px 17px',
            borderRadius: 'var(--radius-input)',
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--accent-contrast)',
            fontWeight: 650,
            fontSize: 14.5,
            cursor: pending ? 'wait' : 'pointer',
          }}
        >
          {pending ? 'Sending…' : 'Send report'}
        </button>
      </form>
    </details>
  )
}
