import { describe, expect, it } from 'vitest'
import { ingestUrl } from '@/lib/discovery/pipeline'
import { prisma } from '@/lib/db/client'
import { decodeProvenance } from '@/lib/discovery/provenance'

/**
 * Opt-in probe: reads one real page off the live internet and reports exactly
 * what Lumen would store about it.
 *
 * ```
 * PROBE_URL="https://example.edu/summer-programme" npx vitest run e2e/probe
 * ```
 *
 * It is skipped unless PROBE_URL is set, so it never runs in an ordinary test
 * pass and never depends on a third party staying up. It asserts almost
 * nothing — the point is to *show* you the extraction, field by field, with the
 * provenance beside each value, so you can compare it against the page in your
 * browser and see whether Lumen read it correctly or quietly guessed.
 *
 * This is the check that cannot be faked by a fixture. Everything else in the
 * suite proves the extractor behaves correctly on HTML I wrote; this proves it
 * behaves on HTML someone else wrote.
 *
 * It writes to whatever DATABASE_URL points at. Use the dev database.
 */

const url = process.env.PROBE_URL

describe.skipIf(!url)('ingesting a real page', () => {
  it('reports what it would store', { timeout: 180_000 }, async () => {
    const result = await ingestUrl(url!)

    if (result.status === 'rejected') {
      console.log(`\n  REFUSED: ${result.reason}\n`)
      console.log('  A refusal is a valid outcome — Lumen declines pages it cannot read')
      console.log('  rather than storing a half-understood record.\n')
      expect(result.reason).toBeTruthy()
      return
    }

    const record = await prisma.opportunity.findUnique({
      where: { slug: result.slug },
      include: { deadlines: true, sources: true, eligibility: true },
    })
    expect(record).not.toBeNull()
    if (!record) return

    const provenance = decodeProvenance(record.fieldProvenance)
    const show = (label: string, value: unknown, field?: string) => {
      const p = field ? provenance[field] : undefined
      const how = p ? `   ← ${p.method} (${p.confidence})` : ''
      console.log(`  ${label.padEnd(14)} ${String(value ?? '— not stated')}${how}`)
    }

    console.log(`\n  ${result.status.toUpperCase()} — /opportunity/${record.slug}\n`)
    show('title', record.title, 'title')
    show('organiser', record.sources[0]?.domain, 'organizerName')
    show('format', record.format, 'format')
    show('cost', [record.costType, record.costAmount, record.costCurrency].filter(Boolean).join(' '), 'costType')
    show('location', [record.locationCity, record.locationCountry].filter(Boolean).join(', '), 'locationCountry')
    show('state', record.verificationState)

    console.log('\n  dates')
    if (record.deadlines.length === 0) console.log('    — none found')
    for (const d of record.deadlines) {
      console.log(`    ${d.kind.padEnd(22)} ${d.date.toISOString().slice(0, 10)}  "${d.rawText ?? ''}"`)
    }

    console.log('\n  eligibility')
    if (record.eligibility.length === 0) console.log('    — none found')
    for (const e of record.eligibility) {
      console.log(`    ${e.dimension} ${e.operator} ${e.value}  "${e.rawText}"`)
    }

    // The one hard guarantee: an automated read can never claim to be verified.
    expect(record.verificationState).not.toBe('VERIFIED')
    console.log('')
  })
})
