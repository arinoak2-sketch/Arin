import { NextResponse } from 'next/server'
import { settleConsent } from '@/lib/consent/store'

export const dynamic = 'force-dynamic'

/**
 * Records the parent's answer.
 *
 * A POST, not a GET, and this is the reason: mail clients and security
 * scanners routinely fetch every link in a message before a human sees it. If
 * agreeing were a GET, consent would be granted by a spam filter. Opening the
 * link only ever shows the question; answering it takes a deliberate submit.
 */
const seeOther = (location: string) =>
  new NextResponse(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params
  const form = await request.formData()
  const decision = String(form.get('decision') ?? '') === 'grant' ? 'grant' : 'decline'

  // Recorded only as a hash, purely as evidence that the approval was an act by
  // someone rather than an artefact of the system.
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? (forwarded.split(',')[0]?.trim() ?? null) : null

  const outcome = await settleConsent(token, decision, ip)
  return seeOther(`/consent/${encodeURIComponent(token)}/done?outcome=${outcome}`)
}
