import 'server-only'
import NextAuth, { type NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db/client'
import { devSignInAllowed, googleAuthCapability, isProduction } from '@/lib/config'

/**
 * Authentication.
 *
 * Google sign-in is the product decision (docs D7). The dev-only credentials
 * provider exists so the app is testable before OAuth credentials are created;
 * it is unconditionally unavailable in production, regardless of environment
 * variables, because a bypass that can be switched on by config is a bypass.
 */

const providers: NextAuthConfig['providers'] = []

if (googleAuthCapability().available) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      allowDangerousEmailAccountLinking: false,
    }),
  )
}

if (devSignInAllowed()) {
  providers.push(
    Credentials({
      id: 'dev',
      name: 'Development sign-in',
      credentials: { email: { label: 'Email', type: 'email' } },
      async authorize(raw) {
        if (isProduction) return null // belt and braces
        const email = typeof raw?.email === 'string' ? raw.email.trim().toLowerCase() : ''
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null

        const user = await prisma.user.upsert({
          where: { email },
          create: { email, name: email.split('@')[0] ?? 'Student' },
          update: { lastActiveAt: new Date() },
        })
        return { id: user.id, email: user.email, name: user.name, image: user.image }
      },
    }),
  )
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  providers,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/signin' },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id
      if (token.sub) {
        // Role and plan are read from the database, never from the client.
        const record = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true, plan: true, deletedAt: true },
        })
        if (!record || record.deletedAt) return null
        token.role = record.role
        token.plan = record.plan
      }
      return token
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
        session.user.role = (token.role as string) ?? 'STUDENT'
        session.user.plan = (token.plan as string) ?? 'FREE'
      }
      return session
    },
  },
  trustHost: true,
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
