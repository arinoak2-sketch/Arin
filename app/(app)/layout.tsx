import Link from 'next/link'
import { requireUser } from '@/lib/auth/session'
import { requireUsableAccount } from '@/lib/consent/gate'
import { prisma } from '@/lib/db/client'
import { triage, countDueWithin } from '@/lib/intelligence/deadlines'
import { SideRail, BottomBar } from '@/components/layout/nav'
import { Wordmark } from '@/components/layout/wordmark'

/**
 * The signed-in shell. Left rail on desktop, bottom tab bar on mobile — both
 * rendered, one hidden per breakpoint, so navigation never reflows on load.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  // An account awaiting parental consent gets no further than this. Checked in
  // the layout so it covers every signed-in page, including ones added later.
  await requireUsableAccount(user.id)

  // Badge count: applications with an actionable deadline inside a week.
  const applications = await prisma.application.findMany({
    where: { userId: user.id, status: { notIn: ['SUBMITTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'COMPLETED'] } },
    select: { opportunity: { select: { deadlines: true } } },
  })
  const dueSoon = applications.reduce(
    (n, a) => n + countDueWithin(triage(a.opportunity.deadlines), 7),
    0,
  )
  const badges = dueSoon > 0 ? { '/applications': dueSoon } : undefined

  return (
    <div style={{ minHeight: '100dvh' }}>
      <style>{RESPONSIVE_CSS}</style>

      <header
        className="lumen-header no-print"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: 'color-mix(in srgb, var(--surface-canvas) 88%, transparent)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--border-hairline)',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <Wordmark href="/dashboard" size={18} />
          <Link
            href="/profile"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              textDecoration: 'none',
              color: 'var(--text-secondary)',
              fontSize: 13.5,
              padding: '6px 10px',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--border-hairline)',
              minHeight: 36,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--accent-wash)',
                color: 'var(--accent)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {(user.name ?? user.email ?? '?').charAt(0).toUpperCase()}
            </span>
            <span className="lumen-hide-sm">Profile</span>
          </Link>
        </div>
      </header>

      <div
        className="lumen-shell"
        style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px 96px', display: 'grid', gap: 28 }}
      >
        <aside className="lumen-aside">
          <div style={{ position: 'sticky', top: 74 }}>
            <SideRail badges={badges} />
            {user.role === 'ADMIN' ? (
              <Link
                href="/admin"
                style={{
                  display: 'block',
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: '1px solid var(--border-hairline)',
                  fontSize: 13.5,
                  color: 'var(--text-tertiary)',
                  textDecoration: 'none',
                }}
              >
                Admin
              </Link>
            ) : null}
          </div>
        </aside>

        <main id="main" style={{ minWidth: 0 }}>
          {children}
        </main>
      </div>

      <div className="lumen-bottombar">
        <BottomBar badges={badges} />
      </div>
    </div>
  )
}

/**
 * Two breakpoints only. Below 900px the rail is replaced by the bottom bar;
 * above it, the bottom bar is removed from the layout entirely.
 */
const RESPONSIVE_CSS = `
.lumen-shell { grid-template-columns: 1fr; }
.lumen-aside { display: none; }
.lumen-bottombar { display: block; }
.lumen-hide-sm { display: none; }
@media (min-width: 900px) {
  .lumen-shell { grid-template-columns: 190px minmax(0, 1fr); }
  .lumen-aside { display: block; }
  .lumen-bottombar { display: none; }
  .lumen-hide-sm { display: inline; }
}
`
