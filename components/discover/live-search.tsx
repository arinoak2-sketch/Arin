'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { runLiveSearch, type LiveSearchResult } from '@/lib/actions/discovery'

/**
 * The live-search banner.
 *
 * The stored corpus renders first, then this fires the live search in the
 * background. It never shows a blank screen and never claims to have searched
 * when it hasn't — a skipped run explains why it was skipped.
 */
export function LiveSearchBanner({ query, enabled }: { query: string; enabled: boolean }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const [result, setResult] = useState<LiveSearchResult | null>(null)
  const started = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !query.trim()) return
    // Guard against React strict-mode double-invocation spending quota twice.
    if (started.current === query) return
    started.current = query

    setState('running')
    setResult(null)
    void runLiveSearch(query)
      .then((r) => {
        setResult(r)
        setState('done')
        if (r.ran && (r.created ?? 0) > 0) router.refresh()
      })
      .catch(() => {
        setResult({ ran: false, reason: 'Live search could not be reached just now. These are stored results.' })
        setState('done')
      })
  }, [query, enabled, router])

  if (!enabled || !query.trim() || state === 'idle') return null

  if (state === 'running') {
    return (
      <Banner tone="neutral">
        <Spinner />
        <span>Searching the live web for “{query}” — showing what Lumen already has meanwhile.</span>
      </Banner>
    )
  }

  if (!result) return null

  if (!result.ran) {
    return (
      <Banner tone="neutral">
        <span aria-hidden="true">◔</span>
        <span>{result.reason}</span>
      </Banner>
    )
  }

  const created = result.created ?? 0
  const merged = result.merged ?? 0

  if (created === 0 && merged === 0) {
    return (
      <Banner tone="neutral">
        <span aria-hidden="true">○</span>
        <span>Searched the live web and found nothing new that Lumen could read. Try different words.</span>
      </Banner>
    )
  }

  return (
    <Banner tone="accent">
      <span aria-hidden="true">✓</span>
      <span>
        {created > 0
          ? `Found ${created} new ${created === 1 ? 'opportunity' : 'opportunities'} on the live web`
          : 'Confirmed existing results against the live web'}
        {merged > 0 ? `, and matched ${merged} to listings Lumen already had` : ''}
        {(result.queuedForReview ?? 0) > 0
          ? `. ${result.queuedForReview} needs a human check before it can be marked verified.`
          : '.'}
      </span>
    </Banner>
  )
}

function Banner({ tone, children }: { tone: 'neutral' | 'accent'; children: React.ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 14px',
        borderRadius: 'var(--radius-card)',
        border: `1px solid ${tone === 'accent' ? 'var(--accent-line)' : 'var(--border-hairline)'}`,
        background: tone === 'accent' ? 'var(--accent-wash)' : 'var(--surface-sunken)',
        color: tone === 'accent' ? 'var(--accent)' : 'var(--text-secondary)',
        fontSize: 13.5,
      }}
    >
      {children}
    </div>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 13,
        height: 13,
        border: '2px solid var(--border-strong)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        display: 'inline-block',
        animation: 'lumen-spin 700ms linear infinite',
        flex: 'none',
      }}
    >
      <style>{'@keyframes lumen-spin { to { transform: rotate(360deg) } }'}</style>
    </span>
  )
}
