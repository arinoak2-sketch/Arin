import Link from 'next/link'

/**
 * Search, as a plain GET form.
 *
 * No client component and no router.push: the browser's own form submission
 * does the work, so this functions before React hydrates and with scripting off
 * entirely. It also makes every search a real URL — shareable, bookmarkable,
 * and correct with the back button — which the previous client-side version
 * only managed by accident.
 */

const EXAMPLES = [
  'free STEM programmes for 16-year-olds in India',
  'research opportunities for high school students',
  'MUNs in September',
  'free summer programmes in Europe for students interested in medicine',
]

export function SearchForm({ initialQuery }: { initialQuery: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <form method="get" action="/discover" role="search" style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        <label
          htmlFor="discover-q"
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
        >
          Describe what you are looking for
        </label>
        <input
          id="discover-q"
          name="q"
          type="search"
          defaultValue={initialQuery}
          placeholder="Describe what you're looking for…"
          autoComplete="off"
          style={{
            flex: '1 1 260px',
            minWidth: 0,
            minHeight: 48,
            padding: '12px 15px',
            fontSize: 15.5,
            borderRadius: 'var(--radius-input)',
            border: '1px solid var(--border-strong)',
            background: 'var(--surface-raised)',
          }}
        />
        <button
          type="submit"
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
          Search
        </button>
      </form>

      {/* Links, not buttons: an example search is a place you can go. */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>Try:</span>
        {EXAMPLES.map((example) => (
          <Link
            key={example}
            href={`/discover?q=${encodeURIComponent(example)}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '5px 11px',
              minHeight: 32,
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--border-hairline)',
              background: 'var(--surface-sunken)',
              color: 'var(--text-secondary)',
              fontSize: 12.5,
              textDecoration: 'none',
            }}
          >
            {example}
          </Link>
        ))}
      </div>
    </div>
  )
}
