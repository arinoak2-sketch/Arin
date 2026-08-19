'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * Navigation. Desktop gets a persistent left rail; mobile gets a bottom tab bar
 * within thumb reach. The mobile bar is a deliberate layout, not the desktop
 * rail scaled down — see docs/03-design-system.md.
 */

export interface NavItem {
  href: string
  label: string
  glyph: string
  badge?: number
}

const ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Today', glyph: '◉' },
  { href: '/discover', label: 'Discover', glyph: '◈' },
  { href: '/applications', label: 'Applications', glyph: '◑' },
  { href: '/calendar', label: 'Calendar', glyph: '▤' },
]

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SideRail({ badges }: { badges?: Record<string, number> }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Main" className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href)
        const badge = badges?.[item.href]
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '10px 12px',
              borderRadius: 'var(--radius-input)',
              textDecoration: 'none',
              fontSize: 14.5,
              fontWeight: active ? 650 : 500,
              color: active ? 'var(--accent)' : 'var(--text-secondary)',
              background: active ? 'var(--accent-wash)' : 'transparent',
              minHeight: 44,
            }}
          >
            <span aria-hidden="true" style={{ width: 16, textAlign: 'center' }}>
              {item.glyph}
            </span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {badge ? <CountPill count={badge} /> : null}
          </Link>
        )
      })}
    </nav>
  )
}

export function BottomBar({ badges }: { badges?: Record<string, number> }) {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Main"
      className="no-print"
      style={{
        position: 'fixed',
        insetInline: 0,
        bottom: 0,
        zIndex: 40,
        display: 'flex',
        background: 'var(--surface-raised)',
        borderTop: '1px solid var(--border-hairline)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href)
        const badge = badges?.[item.href]
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              // 56px keeps the whole target comfortably above the 44px minimum.
              minHeight: 56,
              padding: '8px 4px',
              textDecoration: 'none',
              color: active ? 'var(--accent)' : 'var(--text-tertiary)',
              position: 'relative',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>
              {item.glyph}
            </span>
            <span style={{ fontSize: 11, fontWeight: active ? 650 : 500 }}>{item.label}</span>
            {badge ? (
              <span style={{ position: 'absolute', top: 6, insetInlineEnd: '50%', transform: 'translateX(22px)' }}>
                <CountPill count={badge} />
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}

function CountPill({ count }: { count: number }) {
  return (
    <span
      className="tabular"
      style={{
        minWidth: 19,
        height: 19,
        padding: '0 5px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--urgent)',
        color: 'var(--text-inverse)',
        fontSize: 11,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {count > 9 ? '9+' : count}
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {' '}
        needing attention
      </span>
    </span>
  )
}

export function ResponsiveNav({ badges, children }: { badges?: Record<string, number>; children: ReactNode }) {
  return (
    <>
      <div className="lumen-rail">
        <SideRail badges={badges} />
        {children}
      </div>
      <div className="lumen-bottom">
        <BottomBar badges={badges} />
      </div>
    </>
  )
}
