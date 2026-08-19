/**
 * Onboarding step definitions.
 *
 * Deliberately NOT in the 'use server' actions file: such a file may only
 * export async functions, so constants and types must live separately.
 */

export const ONBOARDING_STEPS = ['basics', 'interests', 'practicalities', 'direction'] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export function nextHref(step: OnboardingStep): string {
  const next = ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(step) + 1]
  return next ? `/onboarding?step=${next}` : '/dashboard'
}

export const isOnboardingStep = (value: string): value is OnboardingStep =>
  (ONBOARDING_STEPS as readonly string[]).includes(value)

/**
 * Validation failures travel back as a redirect parameter rather than as
 * useActionState's returned state.
 *
 * useActionState and redirect() cannot both be used in one action: without
 * JavaScript the framework expects the action to return state it can serialise
 * back into the form, and a redirect never returns. Onboarding needs to
 * redirect on success, so errors are carried in the URL instead — which also
 * survives a refresh and a shared link, where component state would not.
 */
export const ONBOARDING_ERRORS = {
  UNREADABLE: 'Please check the values above — one of them could not be read.',
  BAD_DATE: 'That date of birth could not be read.',
  TOO_YOUNG: 'Lumen is for students aged 13 and over.',
  EU_AGE: 'In the EU, Lumen currently requires you to be 16 or over while parental-consent handling is being built.',
} as const

export type OnboardingErrorCode = keyof typeof ONBOARDING_ERRORS

export const isOnboardingError = (value: string): value is OnboardingErrorCode =>
  Object.prototype.hasOwnProperty.call(ONBOARDING_ERRORS, value)

export function errorHref(step: OnboardingStep, code: OnboardingErrorCode): string {
  return `/onboarding?step=${step}&error=${code}`
}
