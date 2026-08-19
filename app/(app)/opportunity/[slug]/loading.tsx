import { CardSkeleton, Skeleton, Stack } from '@/components/ui/primitives'

export default function OpportunityLoading() {
  return (
    <Stack gap={28}>
      <Stack gap={12}>
        <Skeleton height={22} width={110} radius={999} />
        <Skeleton height={34} width="75%" />
        <Skeleton height={14} width={200} />
        <Skeleton height={24} width={280} radius={999} />
      </Stack>
      <CardSkeleton />
      <Stack gap={12}>
        <Skeleton height={20} width={220} />
        <CardSkeleton />
      </Stack>
      <span
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
        role="status"
      >
        Loading this opportunity
      </span>
    </Stack>
  )
}
