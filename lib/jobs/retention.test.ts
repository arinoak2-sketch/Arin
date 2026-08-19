import { describe, expect, it } from 'vitest'
import { cutoffFor, DISCOVERY_LOG_RETENTION_DAYS, NOTIFICATION_RETENTION_DAYS } from './retention'

/**
 * The retention window is a promise made to students in the decision log, so
 * the constant behind it is worth pinning: a silent change from 90 days to 900
 * would break that promise without breaking anything else.
 */
describe('retention windows', () => {
  it('keeps discovery logs for exactly the promised 90 days', () => {
    expect(DISCOVERY_LOG_RETENTION_DAYS).toBe(90)
  })

  it('keeps sent notifications no longer than the discovery logs', () => {
    expect(NOTIFICATION_RETENTION_DAYS).toBeLessThanOrEqual(DISCOVERY_LOG_RETENTION_DAYS)
  })

  it('computes the cutoff as a point in the past, not the future', () => {
    const now = new Date('2026-08-19T00:00:00Z')
    const cutoff = cutoffFor(DISCOVERY_LOG_RETENTION_DAYS, now)
    expect(cutoff.getTime()).toBeLessThan(now.getTime())
    expect(cutoff.toISOString().slice(0, 10)).toBe('2026-05-21')
  })

  it('treats a zero-day window as "everything up to now"', () => {
    const now = new Date('2026-08-19T12:00:00Z')
    expect(cutoffFor(0, now).getTime()).toBe(now.getTime())
  })
})
