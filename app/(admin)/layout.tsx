import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/session'
import { Wordmark } from '@/components/layout/wordmark'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return (
    <div style={{ minHeight: '100dvh' }}>
      <header
        style={{
          borderBottom: '1px solid var(--border-hairline)',
          background: 'var(--surface-raised)',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '13px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Wordmark href="/dashboard" size={17} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--caution)',
                border: '1px solid currentColor',
                borderRadius: 'var(--radius-pill)',
                padding: '3px 9px',
              }}
            >
              Admin
            </span>
          </div>
          <Link href="/dashboard" style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
            Back to Lumen
          </Link>
        </div>
      </header>
      <main id="main" style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px 80px' }}>
        {children}
      </main>
    </div>
  )
}
