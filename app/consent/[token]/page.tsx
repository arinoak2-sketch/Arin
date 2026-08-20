import { notFound } from 'next/navigation'
import { lookupConsentToken } from '@/lib/consent/store'
import { Wordmark } from '@/components/layout/wordmark'
import { Card, Stack } from '@/components/ui/primitives'

export const metadata = { title: 'Permission for a student account', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * What a parent sees when they open the link.
 *
 * Deliberately outside every authenticated layout: the person reading this has
 * no Lumen account and should not be asked to make one in order to say no.
 * Holding the token is the only authentication, which is why the token is
 * random, hashed at rest, single-use and short-lived.
 *
 * Both answers are given equal weight on the page. A consent screen where
 * "yes" is a button and "no" is a closed tab collects agreement, not consent.
 */
export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const lookup = await lookupConsentToken(token)
  if (!lookup) notFound()

  // Null once settled or expired — the lookup deliberately stops identifying
  // the student to anyone holding a spent link.
  const who = lookup.studentName?.trim() || lookup.studentEmail || 'The student'

  return (
    <main id="main" style={{ maxWidth: 560, margin: '0 auto', padding: '48px 22px 80px' }}>
      <Stack gap={28}>
        <Wordmark size={18} />

        {lookup.status === 'PENDING' ? (
          <Stack gap={20}>
            <Stack gap={8}>
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.022em', lineHeight: 1.2 }}>
                Does {who} have your permission to use Lumen?
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Lumen helps students find scholarships, competitions and programmes they are eligible
                for, and keeps track of the deadlines. They are under 16 and in the EU, so the law
                requires your agreement before we can hold their information.
              </p>
            </Stack>

            <Card>
              <Stack gap={10}>
                <strong style={{ fontSize: 14, fontWeight: 650 }}>What would be stored</strong>
                <ul style={{ margin: 0, paddingInlineStart: 20, fontSize: 14, lineHeight: 1.7 }}>
                  <li>Their date of birth, country and school year</li>
                  <li>Subjects and directions they say they are interested in</li>
                  <li>Opportunities they save, and their progress on applications</li>
                </ul>
                <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  It is never sold or shared. You or they can export or delete all of it at any time,
                  and you can withdraw this permission later.
                </p>
              </Stack>
            </Card>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <form method="post" action={`/api/consent/${encodeURIComponent(token)}`}>
                <input type="hidden" name="decision" value="grant" />
                <button type="submit" style={primary}>
                  Yes, they have my permission
                </button>
              </form>
              <form method="post" action={`/api/consent/${encodeURIComponent(token)}`}>
                <input type="hidden" name="decision" value="decline" />
                <button type="submit" style={secondary}>
                  No
                </button>
              </form>
            </div>

            <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              You can also simply close this page. Nothing happens until you choose, and the request
              expires on its own.
            </p>
          </Stack>
        ) : (
          <Settled status={lookup.status} />
        )}
      </Stack>
    </main>
  )
}

/**
 * Shown when the link has already been used or has run out.
 *
 * Names nobody. Once the answer is in, repeating a minor's name to whoever
 * opens the link adds nothing for the parent and keeps identifying a child to
 * anyone the message was forwarded to.
 */
function Settled({ status }: { status: string }) {
  const copy: Record<string, { title: string; body: string }> = {
    GRANTED: {
      title: 'Already answered — you said yes',
      body: 'They can use Lumen. If you change your mind, contact us and we will withdraw it and delete their information.',
    },
    REVOKED: {
      title: 'Already answered — you said no',
      body: 'The account stays locked and will be deleted. Nothing further is needed from you.',
    },
    EXPIRED: {
      title: 'This link has expired',
      body: 'For safety these links stop working after a couple of weeks. If they still want to use Lumen, they can send a new request.',
    },
  }
  const text = copy[status] ?? copy.EXPIRED!

  return (
    <Stack gap={10}>
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{text.title}</h1>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text.body}</p>
    </Stack>
  )
}

const primary: React.CSSProperties = {
  minHeight: 48,
  padding: '13px 22px',
  borderRadius: 'var(--radius-input)',
  border: 'none',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  fontWeight: 650,
  fontSize: 15.5,
  cursor: 'pointer',
}

const secondary: React.CSSProperties = {
  minHeight: 48,
  padding: '13px 22px',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-raised)',
  color: 'var(--text-primary)',
  fontWeight: 600,
  fontSize: 15.5,
  cursor: 'pointer',
}
