'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/primitives'

const EXAMPLES = [
  'free STEM programmes for 16-year-olds in India',
  'research opportunities for high school students',
  'MUNs in September',
  'free summer programmes in Europe for students interested in medicine',
]

export function SearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initialQuery)

  function submit(query: string) {
    const q = query.trim()
    router.push(q ? `/discover?q=${encodeURIComponent(q)}` : '/discover')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          submit(value)
        }}
        style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}
      >
        <label htmlFor="discover-q" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Describe what you are looking for
        </label>
        <input
          id="discover-q"
          name="q"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
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
        <Button type="submit" variant="primary" size="lg">
          Search
        </Button>
      </form>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>Try:</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setValue(example)
              submit(example)
            }}
            style={{
              padding: '5px 11px',
              minHeight: 32,
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--border-hairline)',
              background: 'var(--surface-sunken)',
              color: 'var(--text-secondary)',
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  )
}
