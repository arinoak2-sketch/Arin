'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { encodeJson } from '@/lib/db/codec'
import { CURRICULA, EDUCATION_LEVELS, FORMAT_PREFERENCES } from '@/lib/db/enums'

/**
 * Profile writes.
 *
 * Two rules that are enforced here rather than in the UI, because the UI is not
 * a security boundary: nobody under 13 gets an account, and EU residents under
 * 16 are held back until the GDPR Article 8 parental-consent flow exists.
 */

const MIN_AGE = 13

/** Members whose GDPR Art. 8 digital-consent age is above 13. */
const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
])
const EU_MIN_AGE = 16

/**
 * An untouched number input submits an empty string, which z.coerce turns into
 * 0 — and 0 then fails a min() check, rejecting the whole form because of a
 * field the student never filled in. Blank must mean "not set", not zero.
 */
const blankToUndefined = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : v)

const optionalNumber = (min: number, max: number, integer = true) =>
  z.preprocess(
    blankToUndefined,
    (integer ? z.coerce.number().int() : z.coerce.number()).min(min).max(max).optional(),
  )

const profileSchema = z.object({
  dateOfBirth: z.string().optional(),
  countryCode: z.preprocess(blankToUndefined, z.string().length(2).optional()),
  city: z.string().max(80).optional(),
  educationLevel: z.preprocess(blankToUndefined, z.enum(EDUCATION_LEVELS).optional()),
  gradeOrYear: optionalNumber(1, 20),
  curriculum: z.preprocess(blankToUndefined, z.enum(CURRICULA).optional()),
  formatPreference: z.preprocess(blankToUndefined, z.enum(FORMAT_PREFERENCES).optional()),
  budgetCeiling: optionalNumber(0, 1_000_000, false),
  budgetCurrency: z.string().max(3).optional(),
  availableFrom: z.string().optional(),
  availableUntil: z.string().optional(),
  weeklyHoursAvailable: optionalNumber(0, 80),
  interests: z.string().optional(),
  careerDirections: z.string().optional(),
})

/** Field names as the student sees them, so an error can point at the right box. */
const FIELD_LABELS: Record<string, string> = {
  dateOfBirth: 'Date of birth',
  countryCode: 'Country',
  city: 'City',
  educationLevel: 'Education level',
  gradeOrYear: 'Year or grade',
  curriculum: 'Curriculum',
  formatPreference: 'Format preference',
  budgetCeiling: 'Most you could pay',
  budgetCurrency: 'Currency',
  availableFrom: 'Free from',
  availableUntil: 'Free until',
  weeklyHoursAvailable: 'Hours a week you could give',
}

export interface ProfileSaveResult {
  ok: boolean
  error?: string
}

export async function saveProfile(formData: FormData): Promise<ProfileSaveResult> {
  const user = await requireUser()

  const parsed = profileSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    // Name the fields. "Something was wrong" leaves a student hunting.
    const fields = [...new Set(parsed.error.issues.map((i) => FIELD_LABELS[String(i.path[0])] ?? String(i.path[0])))]
    return {
      ok: false,
      error: `Please check ${fields.join(', ')} — ${fields.length === 1 ? 'that value' : 'those values'} could not be read.`,
    }
  }

  const data = parsed.data
  const dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null
  const countryCode = data.countryCode ? data.countryCode.toUpperCase() : null

  if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) {
    return { ok: false, error: 'That date of birth could not be read.' }
  }

  if (dateOfBirth) {
    const age = ageFrom(dateOfBirth)
    if (age < MIN_AGE) {
      return { ok: false, error: `Lumen is for students aged ${MIN_AGE} and over.` }
    }
    if (countryCode && EU_COUNTRIES.has(countryCode) && age < EU_MIN_AGE) {
      return {
        ok: false,
        error: `In the EU, Lumen currently requires you to be ${EU_MIN_AGE} or over while parental-consent handling is being built.`,
      }
    }
  }

  const interests = splitList(data.interests)
  const careerDirections = splitList(data.careerDirections)

  const numeric = (value: number | undefined): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null

  await prisma.$transaction(async (tx) => {
    const profile = await tx.studentProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        dateOfBirth,
        countryCode,
        city: data.city || null,
        educationLevel: data.educationLevel || null,
        gradeOrYear: numeric(data.gradeOrYear),
        curriculum: data.curriculum || null,
        formatPreference: data.formatPreference ?? 'ANY',
        budgetCeiling: numeric(data.budgetCeiling),
        budgetCurrency: data.budgetCurrency?.toUpperCase() || null,
        availableFrom: parseDate(data.availableFrom),
        availableUntil: parseDate(data.availableUntil),
        weeklyHoursAvailable: numeric(data.weeklyHoursAvailable),
        careerDirections: encodeJson(careerDirections),
      },
      update: {
        dateOfBirth,
        countryCode,
        city: data.city || null,
        educationLevel: data.educationLevel || null,
        gradeOrYear: numeric(data.gradeOrYear),
        curriculum: data.curriculum || null,
        formatPreference: data.formatPreference ?? 'ANY',
        budgetCeiling: numeric(data.budgetCeiling),
        budgetCurrency: data.budgetCurrency?.toUpperCase() || null,
        availableFrom: parseDate(data.availableFrom),
        availableUntil: parseDate(data.availableUntil),
        weeklyHoursAvailable: numeric(data.weeklyHoursAvailable),
        careerDirections: encodeJson(careerDirections),
      },
    })

    // Tags are replaced wholesale: the form always submits the full set.
    await tx.profileTag.deleteMany({ where: { profileId: profile.id } })

    for (const slug of interests) {
      const tag = await tx.tag.upsert({
        where: { slug },
        create: { slug, label: humanise(slug), kind: 'INTEREST' },
        update: {},
      })
      await tx.profileTag.create({ data: { profileId: profile.id, tagId: tag.id, strength: 4 } })
    }
  })

  revalidatePath('/profile')
  revalidatePath('/dashboard')
  revalidatePath('/discover')
  return { ok: true }
}

/**
 * Full account deletion. Cascades remove the profile, saves, applications,
 * checklists and notifications; the User row is anonymised rather than dropped
 * so foreign keys on audit records stay intact without holding personal data.
 */
export async function deleteAccount(): Promise<{ ok: boolean }> {
  const user = await requireUser()
  await prisma.$transaction([
    prisma.studentProfile.deleteMany({ where: { userId: user.id } }),
    prisma.savedOpportunity.deleteMany({ where: { userId: user.id } }),
    prisma.application.deleteMany({ where: { userId: user.id } }),
    prisma.notification.deleteMany({ where: { userId: user.id } }),
    prisma.matchResult.deleteMany({ where: { userId: user.id } }),
    prisma.discoveryQuery.updateMany({ where: { userId: user.id }, data: { userId: null } }),
    prisma.account.deleteMany({ where: { userId: user.id } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        deletedAt: new Date(),
        email: `deleted-${user.id}@lumen.invalid`,
        name: null,
        image: null,
      },
    }),
  ])
  return { ok: true }
}

const splitList = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((s) => slugify(s))
    .filter((s) => s.length > 1)
    .slice(0, 20)

const slugify = (s: string): string =>
  s.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')

const humanise = (slug: string): string =>
  slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())

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
