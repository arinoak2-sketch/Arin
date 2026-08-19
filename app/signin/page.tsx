import { redirect } from 'next/navigation'
import { devSignInAllowed, googleAuthCapability } from '@/lib/config'
import { currentUser } from '@/lib/auth/session'
import { signIn } from '@/lib/auth/config'
import { Button, Card, Stack, UnavailableNotice } from '@/components/ui/primitives'
import { Wordmark } from '@/components/layout/wordmark'

export const metadata = { title: 'Sign in' }

export default async function SignInPage() {
  if (await currentUser()) redirect('/dashboard')

  const google = googleAuthCapability()
  const devAllowed = devSignInAllowed()

  return (
    <main id="main" style={{ maxWidth: 420, margin: '0 auto', padding: '72px 22px' }}>
      <Stack gap={28}>
        <Wordmark />

        <Stack gap={8}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>Sign in to Lumen</h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Your profile is used to work out what you are eligible for. It is never sold, never shared, and you can
            export or delete it at any time.
          </p>
        </Stack>

        {google.available ? (
          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: '/dashboard' })
            }}
          >
            <Button type="submit" variant="primary" size="lg" full>
              Continue with Google
            </Button>
          </form>
        ) : (
          <UnavailableNotice
            title="Google sign-in is not configured"
            reason="This deployment has no Google OAuth credentials set, so the usual sign-in button is unavailable."
          />
        )}

        {devAllowed ? (
          <Card>
            <Stack gap={12}>
              <Stack gap={4}>
                <strong style={{ fontSize: 14, fontWeight: 650 }}>Development sign-in</strong>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Available only because this is a development build. It is disabled in production regardless of
                  configuration.
                </p>
              </Stack>
              <form
                action={async (formData: FormData) => {
                  'use server'
                  const email = String(formData.get('email') ?? '')
                  await signIn('dev', { email, redirectTo: '/dashboard' })
                }}
              >
                <Stack gap={10}>
                  <label style={{ fontSize: 13, fontWeight: 600 }} htmlFor="dev-email">
                    Email address
                  </label>
                  <input
                    id="dev-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    style={{
                      padding: '11px 12px',
                      borderRadius: 'var(--radius-input)',
                      border: '1px solid var(--border-strong)',
                      background: 'var(--surface-sunken)',
                      fontSize: 14.5,
                      minHeight: 44,
                    }}
                  />
                  <Button type="submit" variant="secondary" full>
                    Continue
                  </Button>
                </Stack>
              </form>
            </Stack>
          </Card>
        ) : null}

        {!google.available && !devAllowed ? (
          <UnavailableNotice
            title="No sign-in method is available"
            reason="An administrator needs to configure Google OAuth credentials before anyone can sign in."
          />
        ) : null}

        <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
          Lumen is for students aged 13 and over. If you are in the EU, sign-up currently requires you to be 16 or
          over while parental-consent handling is being built.
        </p>
      </Stack>
    </main>
  )
}
