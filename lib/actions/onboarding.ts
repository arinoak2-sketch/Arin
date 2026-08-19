'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { encodeJson } from '@/lib/db/codec'
import { EDUCATION_LEVELS, FORMAT_PREFERENCES } from '@/lib/db/enums'
import { isOnboardingStep, nextHref, type OnboardingStep, type StepResult } from '@/lib/onboarding/steps'

/**
 * Onboarding, one step at a time.
 *
 * Every step is a real form posting to a server action, and every step is
 * skippable. A student who abandons halfway keeps whatever they entered — the
 * profile row is created on the first submit, so nothing is lost and nobody is
 * trapped in the flow.
 */

const MIN_AGE = 13
const EU_MIN_AGE = 16
const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
])

const blank = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : v)

/** Ensures the row exists so a skip still records that the student got here. */
async function ensureProfile(userId: string) {
  return prisma.studentProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  })
}

const basicsSchema = z.object({
  dateOfBirth: z.string().optional(),
  countryCode: z.preprocess(blank, z.string().length(2).optional()),
  educationLevel: z.preprocess(blank, z.enum(EDUCATION_LEVELS).optional()),
  gradeOrYear: z.preprocess(blank, z.coerce.number().int().min(1).max(20).optional()),
})

export async function saveBasics(_prev: StepResult | null, formData: FormData): Promise<StepResult> {
  const user = await requireUser()
  const parsed = basicsSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, error: 'Please check the values above — one of them could not be read.' }
  }

  const { dateOfBirth, countryCode, educationLevel, gradeOrYear } = parsed.data
  const dob = dateOfBirth ? new Date(dateOfBirth) : null
  const country = countryCode ? countryCode.toUpperCase() : null

  if (dob && Number.isNaN(dob.getTime())) {
    return { ok: false, error: 'That date of birth could not be read.' }
  }
  if (dob) {
    const age = ageFrom(dob)
    if (age < MIN_AGE) {
      return { ok: false, error: `Lumen is for students aged ${MIN_AGE} and over.` }
    }
    if (country && EU_COUNTRIES.has(country) && age < EU_MIN_AGE) {
      return {
        ok: false,
        error: `In the EU, Lumen currently requires you to be ${EU_MIN_AGE} or over while parental-consent handling is being built.`,
      }
    }
  }

  await prisma.studentProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, dateOfBirth: dob, countryCode: country, educationLevel: educationLevel ?? null, gradeOrYear: gradeOrYear ?? null },
    update: { dateOfBirth: dob, countryCode: country, educationLevel: educationLevel ?? null, gradeOrYear: gradeOrYear ?? null },
  })

  revalidatePath('/dashboard')
  redirect(nextHref('basics'))
}

export async function saveInterests(_prev: StepResult | null, formData: FormData): Promise<StepResult> {
  const user = await requireUser()
  const raw = String(formData.get('interests') ?? '')
  const slugs = splitList(raw)

  const profile = await ensureProfile(user.id)

  await prisma.$transaction(async (tx) => {
    await tx.profileTag.deleteMany({ where: { profileId: profile.id } })
    for (const slug of slugs) {
      const tag = await tx.tag.upsert({
        where: { slug },
        create: { slug, label: humanise(slug), kind: 'INTEREST' },
        update: {},
      })
      await tx.profileTag.create({ data: { profileId: profile.id, tagId: tag.id, strength: 4 } })
    }
  })

  revalidatePath('/dashboard')
  revalidatePath('/discover')
  redirect(nextHref('interests'))
}

const practicalitiesSchema = z.object({
  formatPreference: z.preprocess(blank, z.enum(FORMAT_PREFERENCES).optional()),
  budgetCeiling: z.preprocess(blank, z.coerce.number().min(0).max(1_000_000).optional()),
  budgetCurrency: z.preprocess(blank, z.string().max(3).optional()),
  availableFrom: z.string().optional(),
  availableUntil: z.string().optional(),
})

export async function savePracticalities(_prev: StepResult | null, formData: FormData): Promise<StepResult> {
  const user = await requireUser()
  const parsed = practicalitiesSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, error: 'Please check the values above — one of them could not be read.' }
  }
  const d = parsed.data

  await prisma.studentProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      formatPreference: d.formatPreference ?? 'ANY',
      budgetCeiling: d.budgetCeiling ?? null,
      budgetCurrency: d.budgetCurrency?.toUpperCase() ?? null,
      availableFrom: parseDate(d.availableFrom),
      availableUntil: parseDate(d.availableUntil),
    },
    update: {
      formatPreference: d.formatPreference ?? 'ANY',
      budgetCeiling: d.budgetCeiling ?? null,
      budgetCurrency: d.budgetCurrency?.toUpperCase() ?? null,
      availableFrom: parseDate(d.availableFrom),
      availableUntil: parseDate(d.availableUntil),
    },
  })

  revalidatePath('/dashboard')
  redirect(nextHref('practicalities'))
}

export async function saveDirection(_prev: StepResult | null, formData: FormData): Promise<StepResult> {
  const user = await requireUser()
  const directions = splitList(String(formData.get('careerDirections') ?? ''))

  await prisma.studentProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, careerDirections: encodeJson(directions) },
    update: { careerDirections: encodeJson(directions) },
  })

  revalidatePath('/dashboard')
  revalidatePath('/discover')
  redirect('/dashboard')
}

/** Skipping still creates the row, so the student is never sent back here. */
export async function skipStep(formData: FormData) {
  const user = await requireUser()
  await ensureProfile(user.id)
  const step = String(formData.get('step') ?? 'basics')
  redirect(isOnboardingStep(step) ? nextHref(step) : '/dashboard')
}

export async function skipOnboarding() {
  const user = await requireUser()
  await ensureProfile(user.id)
  redirect('/dashboard')
}

const splitList = (raw: string): string[] =>
  raw
    .split(',')
    .map(slugify)
    .filter((s) => s.length > 1)
    .slice(0, 20)

const slugify = (s: string): string =>
  s.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')

const humanise = (slug: string): string => slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())

function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function ageFrom(dateOfBirth: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear()
  const m = now.getUTCMonth() - dateOfBirth.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) age--
  return age
}
