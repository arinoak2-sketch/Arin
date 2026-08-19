/**
 * Onboarding step definitions.
 *
 * Deliberately NOT in the 'use server' actions file: such a file may only
 * export async functions, so constants and types must live separately.
 */

export const ONBOARDING_STEPS = ['basics', 'interests', 'practicalities', 'direction'] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export interface StepResult {
  ok: boolean
  error?: string
}

export function nextHref(step: OnboardingStep): string {
  const next = ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(step) + 1]
  return next ? `/onboarding?step=${next}` : '/dashboard'
}

export const isOnboardingStep = (value: string): value is OnboardingStep =>
  (ONBOARDING_STEPS as readonly string[]).includes(value)
