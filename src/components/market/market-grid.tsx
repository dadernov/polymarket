"use client";

import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Spinner } from "@/components/ui/empty-state";
import { REFRESH, api, eventsPath, queryKeys, type EventsParams } from "@/lib/api";
import type { MarketEvent, Paginated, SparklineMap } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  EventCard,
  cardTokenIds,
  headlineTokenId,
  type QuickBuyHandler,
} from "./event-card";

// Карточек в ряду меньше, чем было: полоса контента одна (сайдбар убран),
// и каждая карточка получила высоту, траекторию и крупное число.
const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

/**
 * Сколько токенов уходит в один запрос спарклайнов.
 *
 * Ряды берутся пакетом на весь видимый список — по запросу на карточку апстрим
 * не выдержит. Но список растёт подгрузкой, и один общий пакет пришлось бы
 * перезапрашивать целиком на каждой странице. Куски фиксированного размера
 * сохраняют ключ: новая страница добавляет запрос, старые остаются в кэше.
 */
const SPARK_CHUNK = 36;

function sparklineQuery(tokenIds: string[]) {
  return {
    queryKey: queryKeys.sparklines(tokenIds),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      api.sparklines(tokenIds, signal),
    staleTime: REFRESH.events,
    // Траектория — не основные данные карточки: без неё карточка полна,
    // поэтому ни повторов при ошибке, ни перезапроса по фокусу окна.
    retry: false,
    refetchOnWindowFocus: false,
  };
}

/** Ряды цен для всех видимых карточек: tokenId → 14 точек. */
function useSparklines(events: MarketEvent[]): SparklineMap {
  const chunks = useMemo(() => {
    const unique = new Set<string>();
    for (const event of events) {
      for (const tokenId of cardTokenIds(event)) unique.add(tokenId);
    }
    const ids = [...unique];
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += SPARK_CHUNK) {
      batches.push(ids.slice(i, i + SPARK_CHUNK));
    }
    return batches;
  }, [events]);

  const results = useQueries({ queries: chunks.map(sparklineQuery) });

  const series: SparklineMap = {};
  for (const result of results) {
    if (result.data) Object.assign(series, result.data);
  }
  return series;
}

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
  const series = useSparklines(events);

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<SearchX />}
        title={emptyTitle}
        description={emptyDescription}
        className="rounded-[16px] border border-dashed border-border"
      />
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <div className={GRID}>
        {events.map((event) => {
          const headline = headlineTokenId(event);
          return (
            <EventCard
              key={event.id}
              event={event}
              points={headline ? series[headline] : undefined}
              series={series}
              onQuickBuy={onQuickBuy}
            />
          );
        })}
      </div>

      {onLoadMore && hasMore && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            size="md"
            onClick={onLoadMore}
            disabled={loading}
            className="min-w-48"
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
