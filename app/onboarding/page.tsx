import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { decodeStringArray } from '@/lib/db/codec'
import {
  isOnboardingError,
  isOnboardingStep,
  ONBOARDING_ERRORS,
  ONBOARDING_STEPS,
  type OnboardingStep,
} from '@/lib/onboarding/steps'
import { Wordmark } from '@/components/layout/wordmark'
import { Eyebrow, Row, Stack } from '@/components/ui/primitives'
import { BasicsStep, DirectionStep, InterestsStep, PracticalitiesStep } from '@/components/onboarding/steps'

export const metadata = { title: 'Set up your profile' }
export const dynamic = 'force-dynamic'

/**
 * Onboarding: four short steps, every one skippable.
 *
 * Each step says what it unlocks rather than just asking for data — "your age
 * is the single most common eligibility rule" is a reason to answer; "Date of
 * birth *" is not. It ends on the dashboard with real results rather than on a
 * congratulations screen.
 *
 * Deliberately outside the (app) group: no nav rail, because there is nothing
 * useful to navigate to until this is done.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string }>
}) {
  const user = await requireUser()
  const params = await searchParams

  const requested = params.step ?? ''
  const step: OnboardingStep = isOnboardingStep(requested) ? requested : 'basics'

  // Validation failures arrive as a code in the URL, never as raw text — so a
  // crafted link cannot put arbitrary words on the page.
  const errorCode = params.error ?? ''
  const error = isOnboardingError(errorCode) ? ONBOARDING_ERRORS[errorCode] : undefined

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
    include: { tags: { include: { tag: true } } },
  })

  const index = ONBOARDING_STEPS.indexOf(step)

  return (
    <main id="main" style={{ maxWidth: 560, margin: '0 auto', padding: '32px 22px 80px' }}>
      <Stack gap={30}>
        <Row gap={14} style={{ justifyContent: 'space-between' }}>
          <Wordmark href="/dashboard" size={18} />
          <form method="post" action="/api/onboarding/skip">
            <button
              type="submit"
              style={{
                background: 'none',
                border: 'none',
                padding: '8px 4px',
                minHeight: 36,
                fontSize: 13.5,
                color: 'var(--text-tertiary)',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              Skip for now
            </button>
          </form>
        </Row>

        <Stack gap={10}>
          <Eyebrow>
            Step {index + 1} of {ONBOARDING_STEPS.length}
          </Eyebrow>
          <StepProgress current={index} total={ONBOARDING_STEPS.length} />
        </Stack>

        {step === 'basics' ? (
          <BasicsStep
            initial={{
              dateOfBirth: profile?.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : '',
              countryCode: profile?.countryCode ?? '',
              educationLevel: profile?.educationLevel ?? '',
              gradeOrYear: profile?.gradeOrYear ?? '',
            }}
            error={error}
          />
        ) : null}

        {step === 'interests' ? (
          <InterestsStep initial={(profile?.tags ?? []).map((t) => t.tag.label).join(', ')} error={error} />
        ) : null}

        {step === 'practicalities' ? (
          <PracticalitiesStep
            initial={{
              formatPreference: profile?.formatPreference ?? 'ANY',
              budgetCeiling: profile?.budgetCeiling ?? '',
              budgetCurrency: profile?.budgetCurrency ?? '',
              availableFrom: profile?.availableFrom ? profile.availableFrom.toISOString().slice(0, 10) : '',
              availableUntil: profile?.availableUntil ? profile.availableUntil.toISOString().slice(0, 10) : '',
            }}
            error={error}
          />
        ) : null}

        {step === 'direction' ? (
          <DirectionStep
            initial={decodeStringArray(profile?.careerDirections)
              .map((s) => s.replace(/-/g, ' '))
              .join(', ')}
            error={error}
          />
        ) : null}

        <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
          Everything here is used only to work out what you are eligible for and why something might suit you. You can
          change or delete all of it at any time from your profile.
        </p>
      </Stack>
    </main>
  )
}

/** Progress as segments, with the count in words for screen readers. */
function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={current + 1}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Step ${current + 1} of ${total}`}
      style={{ display: 'flex', gap: 6 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            height: 4,
            flex: 1,
            borderRadius: 'var(--radius-pill)',
            background: i <= current ? 'var(--accent)' : 'var(--surface-sunken)',
            border: i <= current ? 'none' : '1px solid var(--border-hairline)',
            transition: 'background 180ms ease',
          }}
        />
      ))}
    </div>
  )
}
