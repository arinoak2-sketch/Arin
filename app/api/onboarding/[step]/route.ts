import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'
import { isOnboardingStep } from '@/lib/onboarding/steps'
import { saveBasics, saveDirection, saveInterests, savePracticalities, skip } from '@/lib/onboarding/save'

/**
 * Onboarding form targets — plain HTTP, no server actions.
 *
 * A form POST that returns 303 works identically whether React has hydrated,
 * is midway through hydrating, or is switched off entirely. That is the whole
 * point: onboarding is the first thing a student touches, often on a slow
 * connection, and it must not be the thing that breaks.
 */
export const dynamic = 'force-dynamic'

const HANDLERS = {
  basics: saveBasics,
  interests: saveInterests,
  practicalities: savePracticalities,
  direction: saveDirection,
} as const

/**
 * Redirects use a RELATIVE Location header rather than an absolute URL.
 *
 * An absolute URL has to name a host, and the host Next derives from a request
 * is not reliably the one the browser used — in development it resolved
 * 127.0.0.1 to localhost, and behind a reverse proxy it can be the internal
 * origin. Session cookies are scoped per host, so redirecting to a different
 * spelling of the same server silently signs the student out. A relative
 * Location is resolved by the browser against the origin it actually used, and
 * cannot get this wrong.
 */
const seeOther = (location: string) =>
  new NextResponse(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } })

export async function POST(request: Request, { params }: { params: Promise<{ step: string }> }) {
  const user = await currentUser()
  if (!user) return seeOther('/signin')

  const { step } = await params
  const form = await request.formData()

  let target: string

  if (step === 'skip') {
    const from = String(form.get('step') ?? '')
    target = await skip(user.id, isOnboardingStep(from) ? from : null)
  } else if (isOnboardingStep(step)) {
    target = await HANDLERS[step](user.id, form)
  } else {
    target = '/onboarding'
  }

  revalidatePath('/dashboard')
  revalidatePath('/discover')
  revalidatePath('/profile')

  // 303 so the browser follows with GET — the correct answer to a form POST,
  // and what makes the back button behave.
  return seeOther(target)
}
