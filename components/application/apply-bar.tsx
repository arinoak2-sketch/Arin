'use client'

import { useFormStatus } from 'react-dom'
import { startApplicationForm } from '@/lib/actions/opportunities'
import { SaveButton } from '@/components/discover/save-button'
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@/lib/db/enums'

/**
 * The sticky action bar. It stays within thumb reach on mobile because the
 * decisions it carries — save, start, open the official page — are the reason
 * the student opened this page at all.
 */
export function ApplyBar({
  opportunityId,
  officialUrl,
  initialSaved,
  applicationStatus,
  eligible,
}: {
  opportunityId: string
  officialUrl: string
  initialSaved: boolean
  applicationStatus: string | null
  eligible: boolean
}) {
  const started = applicationStatus !== null

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed',
        insetInline: 0,
        bottom: 0,
        zIndex: 35,
        background: 'var(--surface-raised)',
        borderTop: '1px solid var(--border-hairline)',
        boxShadow: 'var(--shadow-3)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '11px 20px calc(11px + 56px)',
          display: 'flex',
          gap: 9,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <SaveButton opportunityId={opportunityId} initialSaved={initialSaved} />

        {started ? (
          <span
            style={{
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 15px',
              borderRadius: 'var(--radius-input)',
              background: 'var(--accent-wash)',
              color: 'var(--accent)',
              fontWeight: 600,
              fontSize: 14.5,
            }}
          >
            {APPLICATION_STATUS_LABELS[(applicationStatus ?? 'PREPARING') as ApplicationStatus]}
          </span>
        ) : (
          <form action={startApplicationForm} style={{ flex: '1 1 180px', display: 'flex' }}>
            <input type="hidden" name="opportunityId" value={opportunityId} />
            <StartSubmit eligible={eligible} />
          </form>
        )}

        <a
          href={officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            padding: '10px 15px',
            borderRadius: 'var(--radius-input)',
            border: '1px solid var(--border-strong)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14.5,
          }}
        >
          Official page ↗
        </a>
      </div>
    </div>
  )
}

/**
 * Separate component so useFormStatus can read the enclosing form's state —
 * the hook only reports on a form above it in the tree.
 */
function StartSubmit({ eligible }: { eligible: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || !eligible}
      title={eligible ? undefined : 'Lumen reads this as outside the stated eligibility.'}
      style={{
        flex: 1,
        minHeight: 44,
        padding: '10px 18px',
        borderRadius: 'var(--radius-input)',
        border: 'none',
        background: eligible ? 'var(--accent)' : 'var(--surface-sunken)',
        color: eligible ? 'var(--accent-contrast)' : 'var(--text-tertiary)',
        fontWeight: 650,
        fontSize: 14.5,
        cursor: eligible ? 'pointer' : 'not-allowed',
      }}
    >
      {pending ? 'Starting…' : 'Start application'}
    </button>
  )
}
