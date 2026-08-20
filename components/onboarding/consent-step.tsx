import { Card, Stack, UnavailableNotice } from '@/components/ui/primitives'

/**
 * The parental-consent step.
 *
 * A server component posting to a route handler, like the rest of onboarding.
 *
 * Tone matters more than usual here. This is the moment a 14-year-old is told
 * they cannot continue on their own, and the difference between "you are not
 * allowed" and "we need a grown-up to say yes" is the difference between an
 * account they abandon and one they come back to. It names the law, because
 * being told *why* is less insulting than being refused.
 */
export function ConsentStep({
  parentEmail,
  state,
  problem,
  canSendEmail,
}: {
  parentEmail: string
  state: 'sent' | 'undelivered' | 'resent' | null
  problem: string | null
  canSendEmail: boolean
}) {
  /*
   * "Undelivered" still counts as requested.
   *
   * The request is recorded whether or not the email went out, so showing the
   * initial prompt again would tell the student nothing happened when in fact
   * their parent is now on record as needing to answer. They see the waiting
   * state, plus an honest notice that it could not be sent automatically.
   */
  const requested = state === 'sent' || state === 'resent' || state === 'undelivered'
  const sent = requested

  return (
    <Stack gap={20}>
      <Stack gap={8}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.022em', lineHeight: 1.15 }}>
          {sent ? 'Waiting for a parent or guardian' : 'One more thing — a grown-up has to agree'}
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {sent
            ? 'They have been sent a link explaining what Lumen does and what it would store. As soon as they agree, everything opens up.'
            : 'You are under 16 and in the EU, where the law says a parent or guardian has to agree before we can keep your information. It takes them one click.'}
        </p>
      </Stack>

      {sent ? (
        <Card>
          <Stack gap={10}>
            <p style={{ fontSize: 14.5, lineHeight: 1.6 }}>
              {state === 'undelivered' ? 'Requested for' : 'Sent to'} <strong>{parentEmail}</strong>.
            </p>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Nothing about you is matched or gathered until they agree. If they decide not to, that is
              the end of it — the account is deleted rather than left sitting here.
            </p>
          </Stack>
        </Card>
      ) : null}

      {state === 'undelivered' ? (
        <UnavailableNotice
          title="The email could not be sent"
          reason="Your request is saved, but the email did not go out. Whoever runs Lumen can see this and will retry — the permission link only ever goes to your parent, so nobody else can approve it for you. Try again later if you would rather not wait."
        />
      ) : null}

      {!canSendEmail && !sent ? (
        <UnavailableNotice
          title="Automatic email is not set up here"
          reason="Email is not switched on for this deployment yet, so your request will be saved but cannot be delivered until it is. Nobody can approve on your parent’s behalf, so this may take a while."
        />
      ) : null}

      <form method="post" action="/api/onboarding/consent">
        <Card>
          <Stack gap={14}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label htmlFor="parent-email" style={{ fontSize: 14, fontWeight: 600 }}>
                {sent ? 'Send to a different address' : 'Your parent or guardian’s email'}
              </label>
              <input
                id="parent-email"
                name="parentEmail"
                type="email"
                required
                autoComplete="off"
                defaultValue={sent ? '' : parentEmail}
                aria-describedby="parent-email-hint"
                placeholder="parent@example.com"
                style={{
                  minHeight: 48,
                  padding: '12px 13px',
                  fontSize: 15.5,
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface-sunken)',
                  width: '100%',
                }}
              />
              <span
                id="parent-email-hint"
                style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.5 }}
              >
                Used once, to ask for permission. It is deleted as soon as they answer, and never
                used for anything else.
              </span>
            </div>

            {problem ? (
              <p role="alert" style={{ fontSize: 13.5, color: 'var(--urgent)', lineHeight: 1.55 }}>
                {problem}
              </p>
            ) : null}
          </Stack>
        </Card>

        <button
          type="submit"
          style={{
            marginTop: 18,
            minHeight: 48,
            padding: '13px 24px',
            borderRadius: 'var(--radius-input)',
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--accent-contrast)',
            fontWeight: 650,
            fontSize: 15.5,
            cursor: 'pointer',
          }}
        >
          {sent ? 'Send again' : 'Ask for permission'}
        </button>
      </form>
    </Stack>
  )
}
