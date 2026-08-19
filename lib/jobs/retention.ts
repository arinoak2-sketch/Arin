import 'server-only'
import { prisma } from '@/lib/db/client'

/**
 * Data retention.
 *
 * docs/00-decisions.md promises that discovery logs are purged after 90 days.
 * A promise about a student's data is worth exactly as much as the code that
 * keeps it, so this is that code — not a policy page.
 *
 * A student's search history is personal: "scholarships for students with a
 * parent in prison", "bursaries for care leavers". Keeping it indefinitely
 * because it was convenient to log would be the wrong default.
 */

export const DISCOVERY_LOG_RETENTION_DAYS = 90

/** Sent notifications older than this are no longer useful to anyone. */
export const NOTIFICATION_RETENTION_DAYS = 60

export interface RetentionReport {
  discoveryQueriesPurged: number
  notificationsPurged: number
  cutoffs: { discoveryQueries: string; notifications: string }
}

export function cutoffFor(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 86_400_000)
}

/**
 * Deletes rather than anonymises. A discovery query with the user id stripped
 * is still a record of what somebody searched for at a given minute, and
 * nothing downstream needs it — the corpus it produced is kept separately.
 */
export async function purgeExpiredData(now: Date = new Date()): Promise<RetentionReport> {
  const queryCutoff = cutoffFor(DISCOVERY_LOG_RETENTION_DAYS, now)
  const notificationCutoff = cutoffFor(NOTIFICATION_RETENTION_DAYS, now)

  const [queries, notifications] = await prisma.$transaction([
    prisma.discoveryQuery.deleteMany({ where: { createdAt: { lt: queryCutoff } } }),
    prisma.notification.deleteMany({
      where: { createdAt: { lt: notificationCutoff }, sentAt: { not: null } },
    }),
  ])

  return {
    discoveryQueriesPurged: queries.count,
    notificationsPurged: notifications.count,
    cutoffs: {
      discoveryQueries: queryCutoff.toISOString(),
      notifications: notificationCutoff.toISOString(),
    },
  }
}

/** What the purge would remove, without removing it. Used by the admin page. */
export async function retentionPreview(now: Date = new Date()) {
  const queryCutoff = cutoffFor(DISCOVERY_LOG_RETENTION_DAYS, now)
  const notificationCutoff = cutoffFor(NOTIFICATION_RETENTION_DAYS, now)

  const [dueQueries, totalQueries, oldest] = await Promise.all([
    prisma.discoveryQuery.count({ where: { createdAt: { lt: queryCutoff } } }),
    prisma.discoveryQuery.count(),
    prisma.discoveryQuery.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ])

  return {
    dueQueries,
    totalQueries,
    oldestQueryAt: oldest?.createdAt ?? null,
    queryCutoff,
    notificationCutoff,
    retentionDays: DISCOVERY_LOG_RETENTION_DAYS,
  }
}
