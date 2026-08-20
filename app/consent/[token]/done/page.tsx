import { Wordmark } from '@/components/layout/wordmark'
import { Stack } from '@/components/ui/primitives'

export const metadata = { title: 'Thank you', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * The confirmation a parent lands on after answering.
 *
 * A separate page rather than a flash message so the answer survives a refresh
 * and the back button, and so the outcome is never inferred from a query
 * parameter that could be forged into something misleading — the wording is
 * chosen from a fixed set, and anything unrecognised falls back to neutral.
 */
const OUTCOMES: Record<string, { title: string; body: string }> = {
  GRANTED: {
    title: 'Thank you — that is everything',
    body: 'They can start using Lumen now. You can withdraw this permission at any time, and their information will be deleted if you do.',
  },
  DECLINED: {
    title: 'Understood — nothing will be stored',
    body: 'The account stays locked and will be deleted. You will not be contacted about it again.',
  },
  ALREADY_SETTLED: {
    title: 'This was already answered',
    body: 'No further action is needed. If you want to change the answer, contact us.',
  },
  EXPIRED: {
    title: 'This link had already expired',
    body: 'For safety these links stop working after a couple of weeks. The student can send a new request if they still want one.',
  },
  NOT_FOUND: {
    title: 'This link is not valid',
    body: 'It may have been replaced by a newer request, or already used. Nothing has been changed.',
  },
}

export default async function ConsentDonePage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string }>
}) {
  const { outcome } = await searchParams
  const text = (outcome && OUTCOMES[outcome]) || OUTCOMES.NOT_FOUND!

  return (
    <main id="main" style={{ maxWidth: 520, margin: '0 auto', padding: '64px 22px' }}>
      <Stack gap={26}>
        <Wordmark size={18} />
        <Stack gap={10}>
          <h1 style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {text.title}
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text.body}</p>
        </Stack>
      </Stack>
    </main>
  )
}
