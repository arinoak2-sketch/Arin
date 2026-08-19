'use client'

import { useFormStatus } from 'react-dom'
import { setApplicationStatusForm } from '@/lib/actions/opportunities'
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@/lib/db/enums'

/**
 * Status change as a form post.
 *
 * A select whose only trigger is onChange needs JavaScript to do anything, so
 * this pairs it with a real submit button. The button stays visible for
 * everyone rather than being hidden once JS loads — a control that appears and
 * disappears depending on how fast the page loaded is worse than one that is
 * simply always there.
 */
export function StatusSelect({ applicationId, status }: { applicationId: string; status: string }) {
  const id = `status-${applicationId}`

  return (
    <form action={setApplicationStatusForm} style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <label htmlFor={id} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        Application status
      </label>
      <select
        id={id}
        name="status"
        defaultValue={status}
        style={{
          minHeight: 40,
          padding: '8px 11px',
          borderRadius: 'var(--radius-input)',
          border: '1px solid var(--border-strong)',
          background: 'var(--surface-raised)',
          fontSize: 13.5,
          cursor: 'pointer',
        }}
      >
        {APPLICATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {APPLICATION_STATUS_LABELS[s as ApplicationStatus]}
          </option>
        ))}
      </select>
      <StatusSubmit />
    </form>
  )
}

function StatusSubmit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        minHeight: 40,
        padding: '8px 13px',
        borderRadius: 'var(--radius-input)',
        border: '1px solid var(--border-strong)',
        background: 'var(--surface-sunken)',
        fontSize: 13,
        fontWeight: 600,
        cursor: pending ? 'wait' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {pending ? 'Saving…' : 'Update status'}
    </button>
  )
}
