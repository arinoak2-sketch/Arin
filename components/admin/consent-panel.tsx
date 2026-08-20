'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { retryConsentDelivery, type ConsentRetryState } from '@/lib/actions/admin'
import { Card, Stack } from '@/components/ui/primitives'

export interface PendingConsent {
  userId: string
  parentEmail: string
  requestedAt: string
  expiresAt: string
  deliveryError: string | null
}

/**
 * Consent requests that never reached a parent.
 *
 * These are accounts a young person created and cannot use, waiting on an
 * email that failed. Without this panel that is invisible — the student sees
 * "waiting for a parent" forever and nobody knows.
 *
 * There is deliberately no way to view or copy the approval link. The token is
 * hashed at rest and unrecoverable, which means an operator cannot hand it to
 * anyone — and, more to the point, cannot click it themselves. An admin who
 * could mint and follow a consent link could manufacture parental consent,
 * which would make the whole control worthless. Retrying delivery is the only
 * action available, and it always sends to the parent's address.
 */
export function ConsentPanel({ pending }: { pending: PendingConsent[] }) {
  const [state, action] = useActionState<ConsentRetryState, FormData>(retryConsentDelivery, {})

  if (pending.length === 0) return null

  return (
    <Card>
      <Stack gap={13}>
        <Stack gap={4}>
          <strong style={{ fontSize: 14, fontWeight: 650 }}>
            {pending.length} consent {pending.length === 1 ? 'request' : 'requests'} not delivered
          </strong>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: '62ch' }}>
            Each is a student who cannot use their account until a parent answers an email that did
            not arrive. Fix the mail configuration, then retry.
          </p>
        </Stack>

        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {pending.map((c, i) => (
            <li
              key={c.userId}
              style={{
                padding: '11px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--border-hairline)',
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'baseline',
                justifyContent: 'space-between',
              }}
            >
              <Stack gap={3} style={{ minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.parentEmail}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                  asked {c.requestedAt} · expires {c.expiresAt}
                  {c.deliveryError ? ` · ${c.deliveryError}` : ''}
                </span>
              </Stack>
              <form action={action}>
                <input type="hidden" name="userId" value={c.userId} />
                <RetryButton />
              </form>
            </li>
          ))}
        </ul>

        {state.message ? (
          <p role="status" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {state.message}
          </p>
        ) : null}
      </Stack>
    </Card>
  )
}

function RetryButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        minHeight: 38,
        padding: '8px 14px',
        borderRadius: 'var(--radius-input)',
        border: '1px solid var(--border-strong)',
        background: 'var(--surface-raised)',
        fontSize: 13,
        fontWeight: 600,
        cursor: pending ? 'progress' : 'pointer',
      }}
    >
      {pending ? 'Sending…' : 'Retry'}
    </button>
  )
}
