import { CardSkeleton, Skeleton, Stack } from '@/components/ui/primitives'

/**
 * Discovery can wait on a database round-trip and, on a cold corpus, on nothing
 * at all. Either way the student sees the shape of the answer immediately
 * rather than a blank rectangle — docs/03-design-system.md, and the reason the
 * skeleton primitive exists.
 */
export default function DiscoverLoading() {
  return (
    <Stack gap={26}>
      <Stack gap={10}>
        <Skeleton height={12} width={90} />
        <Skeleton height={30} width="60%" />
        <Skeleton height={15} width="80%" />
      </Stack>
      <Skeleton height={48} radius={6} />
      <Stack gap={14}>
        <Skeleton height={18} width={180} />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </Stack>
      <span
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
        role="status"
      >
        Loading opportunities
      </span>
    </Stack>
  )
}
