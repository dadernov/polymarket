import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

/** Скелет повторяет сетку EventView, чтобы контент не «прыгал» при появлении. */
export default function Loading() {
  return (
    <Container className="py-5 lg:py-6">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-1">
          {/* Шапка */}
          <div className="flex items-start gap-4">
            <Skeleton className="size-14 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-6 w-4/5" />
              <div className="flex gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
            <Skeleton className="h-8 w-32 shrink-0 rounded-lg" />
          </div>

          {/* График */}
          <div className="card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-28" />
              </div>
              <Skeleton className="h-8 w-56 rounded-lg" />
            </div>
            <Skeleton className="mt-4 h-[320px] w-full rounded-xl" />
          </div>
        </div>

        <div className="min-w-0 space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Skeleton className="h-[380px] w-full rounded-xl" />
          <Skeleton className="h-[260px] w-full rounded-xl" />
        </div>

        <div className="min-w-0 space-y-7 lg:col-start-1 lg:row-start-2">
          <div className="space-y-px overflow-hidden rounded-xl border border-border">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3">
                <Skeleton className="size-8 shrink-0 rounded-lg" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-8 w-[136px] rounded-lg" />
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex gap-6 border-b border-border pb-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 py-1">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Container>
  );
}
