import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { decodeStringArray } from '@/lib/db/codec'
import { profileCompleteness, profileStrength } from '@/lib/intelligence/completeness'
import { loadProfile } from '@/lib/repo/opportunities'
import { Card, Eyebrow, Meter, Row, SectionHeading, Stack } from '@/components/ui/primitives'
import { ProfileForm } from '@/components/profile/profile-form'
import { DangerZone } from '@/components/profile/danger-zone'

export const metadata = { title: 'Profile' }
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const user = await requireUser()

  const [record, profile] = await Promise.all([
    prisma.studentProfile.findUnique({
      where: { userId: user.id },
      include: { tags: { include: { tag: true } }, achievements: true },
    }),
    loadProfile(user.id),
  ])

  const completeness = profileCompleteness(record, profile)
  const strength = profileStrength(record?.achievements ?? [])
  const hasAchievements = (record?.achievements.length ?? 0) > 0

  return (
    <Stack gap={30}>
      <Stack gap={6}>
        <Eyebrow>Profile</Eyebrow>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.022em' }}>Your profile</h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: '62ch' }}>
          Everything here is used to work out what you are eligible for and why something might suit you. Nothing is
          shared with anybody, and you can delete all of it at any time.
        </p>
      </Stack>

      <Card style={{ background: 'var(--accent-wash)', borderColor: 'var(--accent-line)' }}>
        <Stack gap={11}>
          <Meter value={completeness.score} label="Profile completeness" />
          {completeness.nextField ? (
            <Stack gap={3}>
              <strong style={{ fontSize: 14.5, fontWeight: 650 }}>{completeness.nextField.prompt}</strong>
              <span style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {completeness.nextField.unlocks}
              </span>
            </Stack>
          ) : (
            <span style={{ fontSize: 14, color: 'var(--accent)' }}>
              Everything Lumen needs for matching is filled in.
            </span>
          )}
        </Stack>
      </Card>

      <ProfileForm
        initial={{
          dateOfBirth: record?.dateOfBirth ? record.dateOfBirth.toISOString().slice(0, 10) : '',
          countryCode: record?.countryCode ?? '',
          city: record?.city ?? '',
          educationLevel: record?.educationLevel ?? '',
          gradeOrYear: record?.gradeOrYear ?? '',
          curriculum: record?.curriculum ?? '',
          formatPreference: record?.formatPreference ?? 'ANY',
          budgetCeiling: record?.budgetCeiling ?? '',
          budgetCurrency: record?.budgetCurrency ?? '',
          availableFrom: record?.availableFrom ? record.availableFrom.toISOString().slice(0, 10) : '',
          availableUntil: record?.availableUntil ? record.availableUntil.toISOString().slice(0, 10) : '',
          weeklyHoursAvailable: record?.weeklyHoursAvailable ?? '',
          interests: (record?.tags ?? []).map((t) => t.tag.label).join(', '),
          careerDirections: decodeStringArray(record?.careerDirections)
            .map((s) => s.replace(/-/g, ' '))
            .join(', '),
        }}
      />

      {/* Strength is shown only once there is something to show. An empty
          chart implies falling short of a standard Lumen does not hold. */}
      {hasAchievements ? (
        <Stack gap={12}>
          <SectionHeading
            eyebrow="Strength"
            title="Where your experience sits"
            description="Measured against your own strongest area, not against a template of the ideal student — there isn't one."
          />
          <Card>
            <Stack gap={13}>
              {strength.map((area) => (
                <Row key={area.key} gap={12} style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, minWidth: 110 }}>{area.label}</span>
                  <span style={{ flex: 1, minWidth: 120 }}>
                    <Meter value={area.relative} label={`${area.label}: ${area.count} recorded`} showValue={false} />
                  </span>
                  <span className="tabular" style={{ fontSize: 13, color: 'var(--text-tertiary)', minWidth: 20, textAlign: 'right' }}>
                    {area.count}
                  </span>
                </Row>
              ))}
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                A short bar is not a weakness. It only matters if it is somewhere you have said you want to go —
                and then Lumen will start suggesting things there.
              </p>
            </Stack>
          </Card>
        </Stack>
      ) : null}

      <DangerZone email={user.email ?? ''} />
    </Stack>
  )
}
