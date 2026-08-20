import { PrismaClient } from '@prisma/client'

/**
 * TEST FIXTURES ONLY.
 *
 * These records exist to exercise the matching engine and the application flow
 * end to end. They are never seeded into a running deployment: the product
 * ships with an empty corpus and fills it from the live web. Every fixture is
 * marked in its title so it can never be mistaken for a real listing.
 */

const prisma = new PrismaClient()

const day = 86_400_000

/** Formats a seeded date the way a source page would write it, so the quoted
 *  "source says" text and the parsed date never contradict each other. */
const asSourceText = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d)

export async function seedFixtures() {
  // Rebuilt from scratch every run, not upserted.
  //
  // Tests mutate these records — reporting a listing flips it to NEEDS_REVIEW,
  // and deadlines are relative to now — so an upsert that left existing rows
  // alone meant one suite could silently change what a later suite asserted.
  // Deleting first is the only way each suite starts from the same state.
  await prisma.opportunity.deleteMany({
    where: { slug: { in: ['test-fixture-eligible', 'test-fixture-ineligible'] } },
  })

  const now = Date.now()
  const applicationDeadline = new Date(now + 20 * day)
  const deadlineText = `Applications close ${asSourceText(applicationDeadline)}`

  await prisma.category.upsert({
    where: { slug: 'research' },
    create: { slug: 'research', label: 'Research' },
    update: {},
  })
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: 'research' } })

  const tag = await prisma.tag.upsert({
    where: { slug: 'molecular-biology' },
    create: { slug: 'molecular-biology', label: 'Molecular biology', kind: 'SUBJECT' },
    update: {},
  })

  const eligible = await prisma.opportunity.create({
    data: {
      slug: 'test-fixture-eligible',
      title: 'TEST FIXTURE — Summer Research Placement',
      summary: 'A test-only record used to exercise the matching engine.',
      format: 'IN_PERSON',
      locationCountry: 'GB',
      locationCity: 'Leeds',
      costType: 'FREE',
      officialUrl: 'https://example.edu/test-fixture-eligible',
      verificationState: 'VERIFIED',
      lastVerifiedAt: new Date(),
      durationDays: 42,
      fieldProvenance: JSON.stringify({
        applicationDeadline: {
          method: 'STRUCTURED_MARKUP',
          sourceUrl: 'https://example.edu/test-fixture-eligible',
          rawText: deadlineText,
          confidence: 'HIGH',
          at: new Date().toISOString(),
        },
      }),
      requirements: JSON.stringify([
        { label: 'Two letters of recommendation', rawText: 'Applicants must submit two letters of recommendation.' },
        { label: 'Academic transcript', rawText: 'An academic transcript is required.' },
        { label: 'Personal statement', rawText: 'Please include a personal statement of 500 words.' },
      ]),
      statedBenefits: JSON.stringify([
        { label: 'Participants receive a certificate of completion', rawText: 'All participants receive a certificate of completion.' },
      ]),
      categories: { create: { categoryId: category.id } },
      tags: { create: { tagId: tag.id, weight: 1 } },
      sources: {
        create: {
          url: 'https://example.edu/test-fixture-eligible',
          domain: 'example.edu',
          isOfficial: true,
          discoveredVia: 'ADMIN',
          fetchedAt: new Date(),
        },
      },
      deadlines: {
        create: [
          { kind: 'APPLICATION_DEADLINE', date: applicationDeadline, rawText: deadlineText },
          { kind: 'PROGRAM_START', date: new Date(now + 60 * day) },
        ],
      },
      eligibility: {
        create: {
          dimension: 'AGE',
          operator: 'BETWEEN',
          value: JSON.stringify({ min: 14, max: 18 }),
          rawText: 'Open to students aged 14-18',
          confidence: 'HIGH',
        },
      },
    },
  })

  const ineligible = await prisma.opportunity.create({
    data: {
      slug: 'test-fixture-ineligible',
      title: 'TEST FIXTURE — Graduate Fellowship',
      summary: 'A test-only record whose age rule excludes the test student.',
      format: 'ONLINE',
      costType: 'UNKNOWN',
      officialUrl: 'https://example.edu/test-fixture-ineligible',
      verificationState: 'NEEDS_REVIEW',
      categories: { create: { categoryId: category.id } },
      tags: { create: { tagId: tag.id, weight: 1 } },
      sources: {
        create: { url: 'https://example.edu/test-fixture-ineligible', domain: 'example.edu', isOfficial: true },
      },
      deadlines: { create: [{ kind: 'APPLICATION_DEADLINE', date: new Date(now + 45 * day) }] },
      eligibility: {
        create: {
          dimension: 'AGE',
          operator: 'BETWEEN',
          value: JSON.stringify({ min: 22, max: 30 }),
          rawText: 'Open to graduates aged 22-30',
          confidence: 'HIGH',
        },
      },
    },
  })

  await prisma.$disconnect()
  return { eligible, ineligible }
}

export async function clearUser(email: string) {
  const client = new PrismaClient()
  const user = await client.user.findUnique({ where: { email } })
  if (user) {
    await client.application.deleteMany({ where: { userId: user.id } })
    await client.savedOpportunity.deleteMany({ where: { userId: user.id } })
    await client.studentProfile.deleteMany({ where: { userId: user.id } })
    await client.user.delete({ where: { id: user.id } })
  }
  await client.$disconnect()
}

/** Temporarily promotes a test user so admin-only pages can be exercised. */
export async function setRole(email: string, role: 'STUDENT' | 'ADMIN') {
  const client = new PrismaClient()
  await client.user.updateMany({ where: { email }, data: { role } })
  await client.$disconnect()
}

/** Reads the raw consent approval token is impossible by design — only the
 *  hash is stored — so tests grant consent directly, the way the parent's
 *  click would. */
export async function grantConsentFor(email: string) {
  const client = new PrismaClient()
  const user = await client.user.findUnique({ where: { email } })
  if (user) {
    await client.parentalConsent.updateMany({
      where: { userId: user.id },
      data: { grantedAt: new Date() },
    })
  }
  await client.$disconnect()
}

export async function clearConsentFor(email: string) {
  const client = new PrismaClient()
  const user = await client.user.findUnique({ where: { email } })
  if (user) await client.parentalConsent.deleteMany({ where: { userId: user.id } })
  await client.$disconnect()
}
