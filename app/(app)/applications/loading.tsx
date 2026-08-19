import { CardSkeleton, Skeleton, Stack } from '@/components/ui/primitives'

export default function ApplicationsLoading() {
  return (
    <Stack gap={26}>
      <Stack gap={8}>
        <Skeleton height={12} width={110} />
        <Skeleton height={30} width="50%" />
        <Skeleton height={15} width="70%" />
      </Stack>
      <CardSkeleton />
      <CardSkeleton />
      <span
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
        role="status"
      >
        Loading your applications
      </span>
    </Stack>
  )
}
