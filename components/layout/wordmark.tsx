import Link from 'next/link'

/** The Lumen mark: a filled aperture. Light, contained, pointed at one thing. */
export function Wordmark({ href = '/', size = 20 }: { href?: string; size?: number }) {
  return (
    <Link
      href={href}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}
    >
      <span
        aria-hidden="true"
        style={{
          width: size + 6,
          height: size + 6,
          borderRadius: 8,
          background: 'var(--accent)',
          display: 'grid',
          placeItems: 'center',
          flex: 'none',
        }}
      >
        <span style={{ width: size / 2.4, height: size / 2.4, borderRadius: '50%', background: 'var(--accent-contrast)' }} />
      </span>
      <span style={{ fontSize: size, fontWeight: 700, letterSpacing: '-0.02em' }}>Lumen</span>
    </Link>
  )
}
