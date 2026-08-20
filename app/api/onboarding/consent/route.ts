import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth/session'
import { requestParentalConsent } from '@/lib/consent/store'
import { consentHref, consentProblemHref } from '@/lib/onboarding/steps'

export const dynamic = 'force-dynamic'

/**
 * Asks a parent for permission.
 *
 * A plain form POST answered with a 303, like the rest of onboarding, so it
 * works before React hydrates and with scripting off entirely. The Location is
 * relative on purpose: an absolute URL built from the request resolved
 * 127.0.0.1 to localhost once and signed people out, because session cookies
 * are per-host.
 */
const seeOther = (location: string) =>
  new NextResponse(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } })

export async function POST(request: Request): Promise<NextResponse> {
  const user = await currentUser()
  if (!user) return seeOther('/signin')

  const form = await request.formData()
  const outcome = await requestParentalConsent(user.id, String(form.get('parentEmail') ?? ''))

  if (!outcome.ok) return seeOther(consentProblemHref(outcome.problem ?? 'That could not be sent.'))
  return seeOther(consentHref(outcome.delivered ? 'sent' : 'undelivered'))
}
