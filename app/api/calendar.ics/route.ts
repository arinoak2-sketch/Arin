import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { DEADLINE_LABELS, type DeadlineKind } from '@/lib/db/enums'

/**
 * iCalendar export of the student's own dates.
 *
 * Session-scoped: there is no shareable token and no user id in the URL, so a
 * leaked link exposes nothing. That costs subscribe-by-URL support, which is
 * the right trade for a product holding minors' data.
 */
export async function GET() {
  const user = await currentUser()
  if (!user) return new NextResponse('Sign in to export your calendar.', { status: 401 })

  const [applications, saved] = await Promise.all([
    prisma.application.findMany({
      where: { userId: user.id, status: { notIn: ['REJECTED', 'WITHDRAWN'] } },
      select: { opportunity: { select: { title: true, slug: true, officialUrl: true, deadlines: true } } },
    }),
    prisma.savedOpportunity.findMany({
      where: { userId: user.id, state: { in: ['SAVED', 'CONSIDERING'] } },
      select: { opportunity: { select: { title: true, slug: true, officialUrl: true, deadlines: true } } },
    }),
  ])

  const seen = new Set<string>()
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lumen//Student opportunity dates//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Lumen deadlines',
  ]

  for (const { opportunity } of [...applications, ...saved]) {
    for (const deadline of opportunity.deadlines) {
      if (deadline.isRollingAdmission) continue
      const uid = `${opportunity.slug}-${deadline.kind}-${deadline.date.getTime()}@lumen`
      if (seen.has(uid)) continue
      seen.add(uid)

      const label = DEADLINE_LABELS[deadline.kind as DeadlineKind] ?? deadline.kind
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${toIcsDate(new Date())}`,
        `DTSTART;VALUE=DATE:${toIcsDay(deadline.date)}`,
        `DTEND;VALUE=DATE:${toIcsDay(new Date(deadline.date.getTime() + 86_400_000))}`,
        `SUMMARY:${escapeIcs(`${label}: ${opportunity.title}`)}`,
        `DESCRIPTION:${escapeIcs(
          deadline.rawText
            ? `Source says: "${deadline.rawText}"\\nConfirm on the official page: ${opportunity.officialUrl}`
            : `Confirm on the official page: ${opportunity.officialUrl}`,
        )}`,
        `URL:${opportunity.officialUrl}`,
        'END:VEVENT',
      )
    }
  }

  lines.push('END:VCALENDAR')

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lumen-deadlines.ics"',
      'Cache-Control': 'private, no-store',
    },
  })
}

const pad = (n: number) => String(n).padStart(2, '0')

const toIcsDay = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`

const toIcsDate = (d: Date) =>
  `${toIcsDay(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`

const escapeIcs = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
