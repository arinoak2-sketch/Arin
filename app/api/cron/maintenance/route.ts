import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { sweepExpired } from '@/lib/discovery/pipeline'
import { purgeExpiredData } from '@/lib/jobs/retention'

/**
 * Scheduled maintenance: expire passed deadlines, purge data past its
 * retention window.
 *
 * Authenticated by a shared secret rather than a session, because the caller is
 * a scheduler, not a person. If CRON_SECRET is unset the route refuses outright
 * — an unauthenticated endpoint that deletes rows is worse than no endpoint.
 */
export const dynamic = 'force-dynamic'

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.trim().length < 16) return false

  const header = request.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (provided.length !== secret.length) return false

  // Constant-time, so the endpoint does not leak the secret a byte at a time.
  return timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
  }

  const now = new Date()
  const [expired, retention] = await Promise.all([sweepExpired(now), purgeExpiredData(now)])

  return NextResponse.json(
    {
      ranAt: now.toISOString(),
      expiredOpportunities: expired,
      discoveryQueriesPurged: retention.discoveryQueriesPurged,
      notificationsPurged: retention.notificationsPurged,
      cutoffs: retention.cutoffs,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/** GET is deliberately unsupported: this endpoint deletes things. */
export function GET() {
  return NextResponse.json({ error: 'Use POST.' }, { status: 405 })
}
