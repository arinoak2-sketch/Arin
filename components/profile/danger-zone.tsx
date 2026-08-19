'use client'

import { useState, useTransition } from 'react'
import { signOut } from 'next-auth/react'
import { deleteAccount } from '@/lib/actions/profile'
import { Card, SectionHeading, Stack } from '@/components/ui/primitives'

/**
 * Deletion is one click plus one typed confirmation — no support ticket, no
 * cooling-off period. A product holding minors' data does not get to make
 * leaving harder than joining.
 */
export function DangerZone({ email }: { email: string }) {
  const [confirm, setConfirm] = useState('')
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  return (
    <Card style={{ borderColor: 'var(--border-strong)' }}>
      <Stack gap={14}>
        <SectionHeading
          title="Your data"
          description="Lumen keeps your profile until you delete it, and purges search logs after 90 days. Nothing is sold or shared."
        />

        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              alignSelf: 'flex-start',
              minHeight: 40,
              padding: '9px 14px',
              borderRadius: 'var(--radius-input)',
              border: '1px solid var(--urgent)',
              background: 'var(--urgent-wash)',
              color: 'var(--urgent)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Delete my account and data
          </button>
        ) : (
          <Stack gap={11}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              This removes your profile, saved opportunities, applications and checklists immediately, and cannot be
              undone. Type <strong>{email}</strong> to confirm.
            </p>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-label="Type your email address to confirm deletion"
              style={{
                minHeight: 44,
                padding: '10px 12px',
                fontSize: 14.5,
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                background: 'var(--surface-sunken)',
              }}
            />
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={confirm !== email || pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteAccount()
                    await signOut({ callbackUrl: '/' })
                  })
                }
                style={{
                  minHeight: 44,
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-input)',
                  border: 'none',
                  background: confirm === email ? 'var(--urgent)' : 'var(--surface-sunken)',
                  color: confirm === email ? 'var(--text-inverse)' : 'var(--text-tertiary)',
                  fontWeight: 650,
                  fontSize: 14.5,
                  cursor: confirm === email ? 'pointer' : 'not-allowed',
                }}
              >
                {pending ? 'Deleting…' : 'Permanently delete'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  minHeight: 44,
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface-raised)',
                  fontSize: 14.5,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </Stack>
        )}
      </Stack>
    </Card>
  )
}
