import 'server-only'
import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { encodeJson } from '@/lib/db/codec'
import { EDUCATION_LEVELS, FORMAT_PREFERENCES } from '@/lib/db/enums'
import { errorHref, nextHref, type OnboardingStep } from './steps'

/**
 * Onboarding persistence.
 *
 * Each function saves a step and returns where to go next; the HTTP layer does
 * the redirecting. That split exists because onboarding is served by plain
 * route handlers rather than server actions.
 *
 * Why: a server action that calls redirect() breaks when the form is submitted
 * natively — which is what happens both with scripting off and, more
 * importantly, in the window before React hydrates. A student tapping
 * "Continue" a moment too early got a 500 page. A plain form POST to a route
 * handler returning 303 is ordinary HTTP that has worked since 1997 and cannot
 * develop a hydration dependency.
 */

const MIN_AGE = 13
const EU_MIN_AGE = 16

/** Members whose GDPR Art. 8 digital-consent age is above 13. */
const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
])

const blank = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : v)

async function ensureProfile(userId: string) {
  return prisma.studentProfile.upsert({ where: { userId }, create: { userId }, update: {} })
}

const basicsSchema = z.object({
  dateOfBirth: z.string().optional(),
  countryCode: z.preprocess(blank, z.string().length(2).optional()),
  educationLevel: z.preprocess(blank, z.enum(EDUCATION_LEVELS).optional()),
  gradeOrYear: z.preprocess(blank, z.coerce.number().int().min(1).max(20).optional()),
})

export async function saveBasics(userId: string, form: FormData): Promise<string> {
  const parsed = basicsSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return errorHref('basics', 'UNREADABLE')

  const { dateOfBirth, countryCode, educationLevel, gradeOrYear } = parsed.data
  const dob = dateOfBirth ? new Date(dateOfBirth) : null
  const country = countryCode ? countryCode.toUpperCase() : null

  if (dob && Number.isNaN(dob.getTime())) return errorHref('basics', 'BAD_DATE')
  if (dob) {
    const age = ageFrom(dob)
    if (age < MIN_AGE) return errorHref('basics', 'TOO_YOUNG')
    if (country && EU_COUNTRIES.has(country) && age < EU_MIN_AGE) return errorHref('basics', 'EU_AGE')
  }

  const data = {
    dateOfBirth: dob,
    countryCode: country,
    educationLevel: educationLevel ?? null,
    gradeOrYear: gradeOrYear ?? null,
  }
  await prisma.studentProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  })

  return nextHref('basics')
}

export async function saveInterests(userId: string, form: FormData): Promise<string> {
  const slugs = splitList(String(form.get('interests') ?? ''))
  const profile = await ensureProfile(userId)

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

  return nextHref('interests')
}

const practicalitiesSchema = z.object({
  formatPreference: z.preprocess(blank, z.enum(FORMAT_PREFERENCES).optional()),
  budgetCeiling: z.preprocess(blank, z.coerce.number().min(0).max(1_000_000).optional()),
  budgetCurrency: z.preprocess(blank, z.string().max(3).optional()),
  availableFrom: z.string().optional(),
  availableUntil: z.string().optional(),
})

export async function savePracticalities(userId: string, form: FormData): Promise<string> {
  const parsed = practicalitiesSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return errorHref('practicalities', 'UNREADABLE')

  const d = parsed.data
  const data = {
    formatPreference: d.formatPreference ?? 'ANY',
    budgetCeiling: d.budgetCeiling ?? null,
    budgetCurrency: d.budgetCurrency?.toUpperCase() ?? null,
    availableFrom: parseDate(d.availableFrom),
    availableUntil: parseDate(d.availableUntil),
  }
  await prisma.studentProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  })

  return nextHref('practicalities')
}

export async function saveDirection(userId: string, form: FormData): Promise<string> {
  const directions = splitList(String(form.get('careerDirections') ?? ''))
  const encoded = encodeJson(directions)
  await prisma.studentProfile.upsert({
    where: { userId },
    create: { userId, careerDirections: encoded },
    update: { careerDirections: encoded },
  })
  return nextHref('direction')
}

/** Skipping still creates the row, so the student is never sent back here. */
export async function skip(userId: string, step: OnboardingStep | null): Promise<string> {
  await ensureProfile(userId)
  return step ? nextHref(step) : '/dashboard'
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
