import 'server-only'
import { redirect } from 'next/navigation'
import { auth } from './config'

/**
 * Authorisation helpers. Every page and action that touches student data goes
 * through one of these — the session is the authority, never a route param.
 */

export async function currentUser() {
  const session = await auth()
  return session?.user ?? null
}

export async function requireUser() {
  const user = await currentUser()
  if (!user) redirect('/signin')
  return user
}

export async function requireAdmin() {
  const user = await requireUser()
  if (user.role !== 'ADMIN') redirect('/dashboard')
  return user
}

export const isAdmin = (user: { role?: string } | null): boolean => user?.role === 'ADMIN'
export const isPremium = (user: { plan?: string } | null): boolean => user?.plan === 'PREMIUM'
