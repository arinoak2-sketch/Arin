import { CardSkeleton, Skeleton, Stack } from '@/components/ui/primitives'

export default function DashboardLoading() {
  return (
    <Stack gap={30}>
      <Stack gap={8}>
        <Skeleton height={12} width={140} />
        <Skeleton height={30} width="45%" />
        <Skeleton height={15} width="65%" />
      </Stack>
      <Stack gap={14}>
        <Skeleton height={18} width={200} />
        <CardSkeleton />
      </Stack>
      <Stack gap={14}>
        <Skeleton height={18} width={160} />
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </Stack>
      <span
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
        role="status"
      >
        Loading your dashboard
      </span>
    </Stack>
  )
}
