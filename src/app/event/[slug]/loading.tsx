import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

/** Скелет повторяет раскладку EventView, чтобы контент не «прыгал» при появлении. */
export default function Loading() {
  return (
    <Container className="py-6 lg:py-9">
      <div className="space-y-7 lg:space-y-8">
        {/* Шапка: вопрос, крупное число и служебный ряд */}
        <div>
          <div className="flex items-start gap-4">
            <Skeleton className="size-14 shrink-0 rounded-[14px]" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-8 w-11/12" />
              <Skeleton className="h-8 w-2/3" />
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Skeleton className="size-9 rounded-[10px]" />
              <Skeleton className="size-9 rounded-[10px]" />
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-5 border-t border-border pt-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-12 w-36" />
            </div>
            <div className="flex gap-5">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-7">
          {/* График и разбор исхода */}
          <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
            <div className="card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2.5">
                  <Skeleton className="h-2.5 w-32" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-9 w-60 rounded-lg" />
              </div>
              <Skeleton className="mt-4 h-[280px] w-full rounded-[14px] sm:h-[340px] lg:h-[400px]" />
            </div>

            <div className="card p-4 sm:p-5">
              <Skeleton className="h-5 w-44" />
              <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-3 sm:gap-6">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-2.5 w-28" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Панель сделки и стакан */}
          <div className="min-w-0 space-y-3 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <Skeleton className="h-[420px] w-full rounded-[16px]" />
            <Skeleton className="h-[280px] w-full rounded-[16px]" />
          </div>

          {/* Список исходов и вкладки */}
          <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-2">
            <div>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-2 h-3 w-3/4" />
              <div className="card mt-3 overflow-hidden">
                {Array.from({ length: 4 }, (_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-b-0"
                  >
                    <Skeleton className="size-8 shrink-0 rounded-[10px]" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-5 w-14" />
                    <Skeleton className="h-8 w-[110px] rounded-lg" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Skeleton className="h-5 w-56" />
              <div className="mt-3 flex gap-6 border-b border-border pb-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="mt-4 space-y-3">
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
        </div>
      </div>
    </Container>
  );
}
