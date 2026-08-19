'use client'

import { useFormStatus } from 'react-dom'
import { toggleTaskForm } from '@/lib/actions/opportunities'

/**
 * A checklist step, as a form post.
 *
 * Ticking a step is the most repeated action in the product, so it must work
 * from the moment the HTML lands rather than from the moment React hydrates.
 * The control is a submit button styled as a checkbox and given the checkbox
 * role, so it behaves correctly for keyboard and screen-reader users too.
 */
export function ChecklistItem({
  id,
  title,
  detail,
  isComplete,
  isRequired,
  warning,
}: {
  id: string
  title: string
  detail: string | null
  isComplete: boolean
  isRequired: boolean
  warning?: string
}) {
  return (
    <li style={{ borderTop: '1px solid var(--border-hairline)' }}>
      <form action={toggleTaskForm}>
        <input type="hidden" name="taskId" value={id} />
        <input type="hidden" name="complete" value={isComplete ? 'false' : 'true'} />
        <TaskRow title={title} detail={detail} isComplete={isComplete} isRequired={isRequired} warning={warning} />
      </form>
    </li>
  )
}

function TaskRow({
  title,
  detail,
  isComplete,
  isRequired,
  warning,
}: {
  title: string
  detail: string | null
  isComplete: boolean
  isRequired: boolean
  warning?: string
}) {
  const { pending } = useFormStatus()
  const checked = pending ? !isComplete : isComplete

  return (
    <button
      type="submit"
      role="checkbox"
      aria-checked={checked}
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        width: '100%',
        padding: '13px 18px',
        minHeight: 48,
        background: 'transparent',
        border: 'none',
        textAlign: 'left',
        cursor: pending ? 'wait' : 'pointer',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flex: 'none',
          marginTop: 2,
          width: 17,
          height: 17,
          borderRadius: 4,
          border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border-strong)'}`,
          background: checked ? 'var(--accent)' : 'var(--surface-raised)',
          color: 'var(--accent-contrast)',
          display: 'grid',
          placeItems: 'center',
          fontSize: 11,
          fontWeight: 700,
          transition: 'background 120ms ease, border-color 120ms ease',
        }}
      >
        {checked ? '✓' : ''}
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span
          style={{
            fontSize: 14.5,
            fontWeight: 550,
            color: checked ? 'var(--text-tertiary)' : 'var(--text-primary)',
            textDecoration: checked ? 'line-through' : 'none',
          }}
        >
          {title}
          {!isRequired ? (
            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>optional</span>
          ) : null}
        </span>
        {detail ? <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{detail}</span> : null}
        {warning && !checked ? (
          <span style={{ fontSize: 12.5, color: 'var(--soon)', lineHeight: 1.5 }}>{warning}</span>
        ) : null}
      </span>
    </button>
  )
}
