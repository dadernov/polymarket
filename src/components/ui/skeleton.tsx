import { cn } from "@/lib/utils";

/** Плейсхолдер загрузки. Пульсирует через --animate-shimmer. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-md bg-surface-hover",
        className,
      )}
    />
  );
}

/** Скелет карточки рынка — совпадает по габаритам с MarketCard. */
export function MarketCardSkeleton() {
  return (
    <div className="card flex h-[188px] flex-col gap-3 p-4">
      <div className="flex gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      </div>
      <div className="mt-auto space-y-2">
        <Skeleton className="h-9 w-full rounded-lg" />
        <div className="flex justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    </div>
  );
}

/** Сетка скелетов для главной и списка рынков. */
export function MarketGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <MarketCardSkeleton key={i} />
      ))}
    </div>
  );
}
