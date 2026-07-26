import { Container } from "@/components/layout/container";
import { MarketGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-6">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <MarketGridSkeleton count={12} />
    </Container>
  );
}
