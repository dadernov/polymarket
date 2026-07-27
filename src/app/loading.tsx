import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Скелет повторяет раскладку списков (главная и каталог): шапка-заголовок с
 * линовкой, полоса контролов и сетка карточек по три в ряд. Габариты совпадают
 * с <EventCard/> — при появлении данных страница не «прыгает».
 */

const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

function CardSkeleton() {
  return (
    <div className="card flex min-h-[212px] flex-col p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="size-11 shrink-0 rounded-[12px]" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <Skeleton className="h-3.5 w-full rounded-full" />
          <Skeleton className="h-3.5 w-3/5 rounded-full" />
        </div>
        {/* Место под крупное число вероятности с траекторией. */}
        <Skeleton className="size-14 shrink-0 rounded-full" />
      </div>

      <Skeleton className="mt-4 h-10 w-full rounded-[10px]" />

      <div className="mt-auto space-y-2.5 pt-4">
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-[10px]" />
          <Skeleton className="h-9 flex-1 rounded-[10px]" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-2.5 w-24 rounded-full" />
          <Skeleton className="h-2.5 w-12 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <Container className="py-7 sm:py-9">
      <p role="status" aria-live="polite" className="sr-only">
        Загружаем рынки…
      </p>

      <div className="rule pb-6">
        <Skeleton className="h-2.5 w-20 rounded-full" />
        <Skeleton className="mt-4 h-9 w-64 rounded-xl sm:h-11 sm:w-80" />
        <Skeleton className="mt-4 h-3 w-full max-w-xl rounded-full" />
        <Skeleton className="mt-2 h-3 w-2/3 max-w-md rounded-full" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Skeleton className="h-10 w-full rounded-[12px] sm:w-[300px]" />
        <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
          <Skeleton className="h-10 w-52 rounded-[12px]" />
          <Skeleton className="h-10 w-44 rounded-[12px]" />
        </div>
      </div>

      <Skeleton className="mt-3 h-3 w-72 max-w-full rounded-full" />

      <div className={`mt-6 ${GRID}`}>
        {Array.from({ length: 9 }, (_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
    </Container>
  );
}
