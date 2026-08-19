import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/session'
import { corpusSize } from '@/lib/repo/opportunities'
import { Card, Eyebrow, LinkButton, Row, Stack } from '@/components/ui/primitives'
import { Wordmark } from '@/components/layout/wordmark'

/**
 * The public landing page.
 *
 * Deliberately contains no testimonials, no partner logos, no user counts and
 * no success statistics, because Lumen has none of those things yet and
 * inventing them would contradict the first promise it makes.
 */

export default async function LandingPage() {
  const user = await currentUser()
  if (user) redirect('/dashboard')

  // The only number on this page is one we can actually count.
  const stored = await corpusSize().catch(() => 0)

  return (
    <main id="main" style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 22px 96px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <Wordmark />
        <LinkButton href="/signin" variant="primary" size="sm">
          Sign in
        </LinkButton>
      </header>

      <section style={{ padding: '72px 0 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Eyebrow>For students aged 13–22, anywhere</Eyebrow>
        <h1 style={{ fontSize: 'clamp(36px, 6vw, 58px)', lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.03em' }}>
          Never miss an opportunity
          <br />
          that could matter to your future.
        </h1>
        <p style={{ fontSize: 19, lineHeight: 1.55, color: 'var(--text-secondary)', maxWidth: '58ch' }}>
          Lumen searches the live web for scholarships, competitions, olympiads, research programmes and summer
          schools — then works out which ones you are <strong>actually eligible for</strong>, explains why in the
          organiser’s own words, and helps you finish the application before the deadline.
        </p>
        <Row gap={12}>
          <LinkButton href="/signin" variant="primary" size="lg">
            Get started
          </LinkButton>
          <LinkButton href="#how" size="lg">
            How it works
          </LinkButton>
        </Row>
      </section>

      <section id="how" style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ fontSize: 26, fontWeight: 650 }}>How Lumen decides what to show you</h2>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {STEPS.map((step, i) => (
            <Card key={step.title}>
              <Stack gap={7}>
                <span
                  className="tabular"
                  style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 style={{ fontSize: 15.5, fontWeight: 650 }}>{step.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{step.body}</p>
              </Stack>
            </Card>
          ))}
        </div>
      </section>

      <section style={{ paddingTop: 56, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ fontSize: 26, fontWeight: 650 }}>What Lumen will not do</h2>
        <p style={{ fontSize: 15.5, color: 'var(--text-secondary)', maxWidth: '68ch', lineHeight: 1.6 }}>
          You might act on what you read here — turn down one programme for another, or plan a summer around a date.
          So these are commitments, not marketing:
        </p>
        <ul style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', listStyle: 'none', padding: 0, margin: 0 }}>
          {PROMISES.map((promise) => (
            <li
              key={promise.title}
              style={{
                border: '1px solid var(--border-hairline)',
                borderLeft: '3px solid var(--accent)',
                borderRadius: 'var(--radius-card)',
                background: 'var(--surface-raised)',
                padding: '15px 17px',
              }}
            >
              <Stack gap={5}>
                <strong style={{ fontSize: 14.5, fontWeight: 650 }}>{promise.title}</strong>
                <span style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{promise.body}</span>
              </Stack>
            </li>
          ))}
        </ul>
      </section>

      <footer
        style={{
          marginTop: 72,
          paddingTop: 26,
          borderTop: '1px solid var(--border-hairline)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-tertiary)' }}>
          {stored > 0
            ? `${stored} ${stored === 1 ? 'opportunity' : 'opportunities'} currently in Lumen’s corpus, each with its source recorded.`
            : 'Lumen’s corpus is empty on this deployment — opportunities appear as they are discovered.'}
        </p>
        <Row gap={16}>
          <Link href="/signin" style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
            Sign in
          </Link>
        </Row>
      </footer>
    </main>
  )
}

const STEPS = [
  {
    title: 'You tell Lumen who you are',
    body: 'Age, country, what you study, what you are interested in, what you can afford and when you are free. Four short steps, and you can skip any of them.',
  },
  {
    title: 'Lumen searches the live web',
    body: 'Not a stale directory. Targeted searches against the open web, favouring university, government and foundation pages over sites that copy listings.',
  },
  {
    title: 'It checks what you are eligible for',
    body: 'Age, grade, country and prior-experience rules are read from the page and checked against your profile. If you cannot enter, Lumen says so instead of showing you a score.',
  },
  {
    title: 'It shows you why — and what is missing',
    body: 'Every match lists its reasons and quotes the source. Then it builds your checklist, starting with the things that take longest.',
  },
]

const PROMISES = [
  {
    title: 'Never invent a deadline',
    body: 'If the official page does not state one, Lumen says “not stated” and links you there. It will not guess, and it will not carry last year’s date into this year.',
  },
  {
    title: 'Never hide how it knows',
    body: 'Every extracted detail records where it came from and when. If AI read it rather than the page’s own data, the listing says so and stays marked unconfirmed.',
  },
  {
    title: 'Never sell your match score',
    body: 'If a sponsored listing ever appears it will be labelled, and it is excluded from scoring and ranking in code. Sponsorship can buy a labelled slot; it cannot buy relevance.',
  },
  {
    title: 'Never promise an outcome',
    body: 'No opportunity will get you into a particular university, and Lumen will not imply otherwise. It tells you what something is and what it might give you.',
  },
]
