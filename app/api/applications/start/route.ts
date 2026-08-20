import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { currentUser } from '@/lib/auth/session'
import { accountIsUsable } from '@/lib/consent/gate'
import { startApplicationFor } from '@/lib/applications/start'

/**
 * Starting an application.
 *
 * A route handler rather than a server action, for the same reason as
 * onboarding: an action that redirects breaks when its form is submitted
 * natively, which is what happens with scripting off and in the window before
 * React hydrates. This is the most consequential button in the product, so it
 * gets the most boring possible mechanism — a form POST answered with a 303.
 *
 * The Location is relative on purpose; see the note in the onboarding handler.
 */
export const dynamic = 'force-dynamic'

const seeOther = (location: string) =>
  new NextResponse(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return seeOther('/signin')
  // The page this posts from is already gated, but a POST does not have to come
  // from a page. An account waiting on parental consent does nothing at all.
  if (!(await accountIsUsable(user.id))) return seeOther('/onboarding?step=consent')

  const form = await request.formData()
  const opportunityId = String(form.get('opportunityId') ?? '')
  const slug = String(form.get('slug') ?? '')

  const result = await startApplicationFor(user.id, opportunityId)

  revalidatePath('/applications')
  revalidatePath('/dashboard')

  // On failure send the student back where they were rather than to a dead end.
  if (!result.ok) return seeOther(slug ? `/opportunity/${slug}` : '/discover')
  return seeOther('/applications')
}
