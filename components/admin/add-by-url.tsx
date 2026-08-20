'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { addOpportunityByUrl, type AddByUrlState } from '@/lib/actions/admin'
import { Card, Stack } from '@/components/ui/primitives'

/**
 * Add one opportunity from its URL.
 *
 * A real form with useActionState rather than a click handler: the action does
 * not redirect, so it returns state the framework can render straight back into
 * the page whether or not React has hydrated. The same reasoning as everything
 * else in the product — a control that only works after hydration is a control
 * that silently does nothing when someone is quick or their connection is slow.
 */
export function AddByUrl() {
  const [state, action] = useActionState<AddByUrlState, FormData>(addOpportunityByUrl, {
    status: 'idle',
  })

  return (
    <Card>
      <Stack gap={13}>
        <Stack gap={4}>
          <strong style={{ fontSize: 14, fontWeight: 650 }}>Add an opportunity by URL</strong>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: '62ch' }}>
            Reads the page through the same pipeline as live search — same fetcher, same extraction,
            same provenance on every field. Giving Lumen the address does not vouch for the content,
            so nothing added here is marked verified until you check it.
          </p>
        </Stack>

        <form action={action} style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <label
            htmlFor="add-url"
            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
          >
            Address of the opportunity page
          </label>
          <input
            id="add-url"
            name="url"
            type="url"
            inputMode="url"
            required
            placeholder="https://example.edu/summer-programme"
            style={{
              flex: '1 1 300px',
              minHeight: 44,
              padding: '10px 13px',
              fontSize: 14.5,
              borderRadius: 'var(--radius-input)',
              border: '1px solid var(--border-strong)',
              background: 'var(--surface-sunken)',
            }}
          />
          <SubmitButton />
        </form>

        {state.status !== 'idle' ? <Outcome state={state} /> : null}
      </Stack>
    </Card>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        minHeight: 44,
        padding: '10px 18px',
        borderRadius: 'var(--radius-input)',
        border: 'none',
        background: 'var(--accent)',
        color: 'var(--accent-contrast)',
        fontSize: 14.5,
        fontWeight: 650,
        cursor: pending ? 'progress' : 'pointer',
      }}
    >
      {pending ? 'Reading the page…' : 'Read and store'}
    </button>
  )
}

function Outcome({ state }: { state: AddByUrlState }) {
  const bad = state.status === 'rejected'
  return (
    <div
      role="status"
      style={{
        borderRadius: 10,
        padding: '11px 13px',
        background: 'var(--surface-sunken)',
        borderLeft: `3px solid ${bad ? 'var(--urgent)' : 'var(--accent)'}`,
      }}
    >
      <Stack gap={4}>
        <span style={{ fontSize: 13.5, lineHeight: 1.55 }}>{state.message}</span>
        {state.slug ? (
          <Link href={`/opportunity/${state.slug}`} style={{ fontSize: 13, fontWeight: 600 }}>
            {state.title ?? 'Open the listing'} →
          </Link>
        ) : null}
      </Stack>
    </div>
  )
}
