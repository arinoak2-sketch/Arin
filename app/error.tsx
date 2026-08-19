'use client'

import { useEffect } from 'react'

/**
 * The error boundary.
 *
 * Two rules it exists to hold. First, it never shows a student a stack trace or
 * a database message — an error is a thing that happened to Lumen, not
 * something they need to debug. Second, it never claims their data is lost when
 * it is not: everything is saved server-side, and saying so is the difference
 * between an annoying moment and a frightening one.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The digest is the only safe handle on the real error; the message itself
    // may contain query fragments and is deliberately not rendered.
    console.error('Lumen error boundary', error.digest ?? '(no digest)')
  }, [error])

  return (
    <main
      id="main"
      style={{ maxWidth: 560, margin: '0 auto', padding: '72px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 650,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
        }}
      >
        Something went wrong
      </span>

      <h1 style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
        Lumen could not load that
      </h1>

      <p style={{ fontSize: 15.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        This is a problem at our end, not yours. Nothing you have saved is affected — your profile, saved
        opportunities and applications are all stored and will be there when this recovers.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: 48,
            padding: '13px 22px',
            borderRadius: 'var(--radius-input)',
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--accent-contrast)',
            fontWeight: 650,
            fontSize: 15.5,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <a
          href="/dashboard"
          style={{
            minHeight: 48,
            display: 'inline-flex',
            alignItems: 'center',
            padding: '13px 22px',
            borderRadius: 'var(--radius-input)',
            border: '1px solid var(--border-strong)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 15.5,
          }}
        >
          Back to today
        </a>
      </div>

      {error.digest ? (
        <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
          If you report this, quote <code>{error.digest}</code>.
        </p>
      ) : null}
    </main>
  )
}
