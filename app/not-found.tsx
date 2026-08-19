import Link from 'next/link'
import { Wordmark } from '@/components/layout/wordmark'

/**
 * A missing opportunity is the common case here, and it usually is not a
 * mistake — listings are archived when a link dies or an organiser withdraws
 * something. Saying that is more useful than "404".
 */
export default function NotFound() {
  return (
    <main
      id="main"
      style={{ maxWidth: 560, margin: '0 auto', padding: '48px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      <Wordmark href="/dashboard" size={18} />

      <h1 style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
        That page isn’t here
      </h1>

      <p style={{ fontSize: 15.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        If you were looking for an opportunity, it may have been archived — Lumen removes listings when the
        organiser’s page disappears or the opportunity is withdrawn, rather than leaving a dead link that looks live.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link
          href="/discover"
          style={{
            minHeight: 48,
            display: 'inline-flex',
            alignItems: 'center',
            padding: '13px 22px',
            borderRadius: 'var(--radius-input)',
            background: 'var(--accent)',
            color: 'var(--accent-contrast)',
            textDecoration: 'none',
            fontWeight: 650,
            fontSize: 15.5,
          }}
        >
          Find opportunities
        </Link>
        <Link
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
        </Link>
      </div>
    </main>
  )
}
