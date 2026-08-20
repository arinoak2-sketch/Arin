import 'server-only'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { accountUsable, assessAge, consentStatus } from './rules'
import { consentHref } from '@/lib/onboarding/steps'

/**
 * The gate that makes the consent flow real.
 *
 * Every authenticated page passes through here. Without it the flow would be
 * decorative: the onboarding branch only changes where a form redirects, and a
 * student who typed /dashboard would be straight into the product.
 *
 * Enforced at the layout, which is the one place every signed-in page shares.
 * Putting it in each page would work until someone adds a page and forgets.
 */
export async function accountIsUsable(userId: string): Promise<boolean> {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { dateOfBirth: true, countryCode: true },
  })
  if (!profile?.dateOfBirth) return true

  const verdict = assessAge(profile.dateOfBirth, profile.countryCode)
  if (verdict.kind === 'ALLOWED') return true

  const record = await prisma.parentalConsent.findUnique({
    where: { userId },
    select: { grantedAt: true, revokedAt: true, expiresAt: true },
  })
  return accountUsable(verdict, consentStatus(record))
}

/** Redirecting form of the same check, for pages and layouts. */
export async function requireUsableAccount(userId: string): Promise<void> {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { dateOfBirth: true, countryCode: true },
  })
  if (!profile?.dateOfBirth) return

  const verdict = assessAge(profile.dateOfBirth, profile.countryCode)
  if (verdict.kind === 'ALLOWED') return

  const record = await prisma.parentalConsent.findUnique({
    where: { userId },
    select: { grantedAt: true, revokedAt: true, expiresAt: true },
  })
  if (accountUsable(verdict, consentStatus(record))) return

  redirect(consentHref(record?.grantedAt ? undefined : 'sent'))
}
