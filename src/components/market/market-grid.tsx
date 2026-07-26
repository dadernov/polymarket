"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Spinner } from "@/components/ui/empty-state";
import { REFRESH, api, eventsPath, queryKeys, type EventsParams } from "@/lib/api";
import type { MarketEvent, Paginated } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EventCard, type QuickBuyHandler } from "./event-card";

const GRID =
  "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export interface MarketGridProps {
  events: MarketEvent[];
  onQuickBuy?: QuickBuyHandler;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Кнопка «Показать ещё» появляется только вместе с обработчиком. */
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  className?: string;
}

export function MarketGrid({
  events,
  onQuickBuy,
  emptyTitle = "Рынков не нашлось",
  emptyDescription = "Попробуйте другую категорию или измените сортировку.",
  onLoadMore,
  hasMore = false,
  loading = false,
  className,
}: MarketGridProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={<SearchX />}
        title={emptyTitle}
        description={emptyDescription}
        className="rounded-xl border border-dashed border-border"
      />
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <div className={GRID}>
        {events.map((event) => (
          <EventCard key={event.id} event={event} onQuickBuy={onQuickBuy} />
        ))}
      </div>

      {onLoadMore && hasMore && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            size="md"
            onClick={onLoadMore}
            disabled={loading}
            className="min-w-44 rounded-xl"
          >
            {loading ? <Spinner /> : null}
            {loading ? "Загружаем…" : "Показать ещё"}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Островок подгрузки                                                  */
/* ------------------------------------------------------------------ */

/**
 * `api.events` не умеет `ascending` — он нужен только сортировке «скоро
 * закрытие», поэтому дописываем параметр к готовому пути вручную.
 */
async function loadPage(
  params: EventsParams,
  ascending: boolean,
  signal?: AbortSignal,
): Promise<Paginated<MarketEvent>> {
  if (!ascending) return api.events(params, signal);

  const path = eventsPath(params);
  const url = `${path}${path.includes("?") ? "&" : "?"}ascending=true`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as Paginated<MarketEvent>;
}

export interface InfiniteMarketGridProps {
  /** Первая страница, отрисованная сервером — клиент её не перезапрашивает. */
  initialPage: Paginated<MarketEvent>;
  params?: EventsParams;
  ascending?: boolean;
  onQuickBuy?: QuickBuyHandler;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

/**
 * Лента событий с ручной подгрузкой. Первая страница приезжает из серверного
 * компонента через `initialPage`, поэтому при загрузке нет клиентского
 * водопада — React Query считает её свежей и не дёргает сеть повторно.
 */
export function InfiniteMarketGrid({
  initialPage,
  params = {},
  ascending = false,
  onQuickBuy,
  emptyTitle,
  emptyDescription,
  className,
}: InfiniteMarketGridProps) {
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.events(params), ascending] as const,
    queryFn: ({ pageParam, signal }) =>
      loadPage({ ...params, offset: pageParam }, ascending, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.nextOffset : undefined),
    initialData: { pages: [initialPage], pageParams: [0] },
    staleTime: REFRESH.events,
  });

  // Gamma при пагинации по offset изредка повторяет события — режем дубли,
  // иначе React ругается на одинаковые key.
  const events = useMemo(() => {
    const seen = new Set<string>();
    const unique: MarketEvent[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const event of page.items) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        unique.push(event);
      }
    }
    return unique;
  }, [query.data]);

  return (
    <MarketGrid
      events={events}
      onQuickBuy={onQuickBuy}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      onLoadMore={() => void query.fetchNextPage()}
      hasMore={query.hasNextPage}
      loading={query.isFetchingNextPage}
      className={className}
    />
  );
}
