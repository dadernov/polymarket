import { ArrowRight, Flame } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { InfiniteMarketGrid } from "@/components/market/market-grid";
import { formatCompact, formatVolume } from "@/lib/format";
import { fetchEvents } from "@/lib/polymarket";
import type { EventSort, MarketEvent, Paginated } from "@/lib/types";

export const revalidate = 20;

const PAGE_SIZE = 24;

const EMPTY: Paginated<MarketEvent> = { items: [], hasMore: false, nextOffset: 0 };

/** Ключи сортировки, которые понимает лента; подписи к ним — в <SortSelect/>. */
const SORT_KEYS = ["volume24hr", "volume", "liquidity", "endDate", "competitive"] as const;

function parseSort(value: string | undefined): { sort: EventSort; ascending: boolean } {
  const sort = SORT_KEYS.find((key) => key === value) ?? "volume24hr";
  // «Скоро закрытие» — единственная сортировка по возрастанию.
  return { sort, ascending: sort === "endDate" };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="whitespace-nowrap text-[11px] leading-none text-faint">{label}</dt>
      <dd className="tnum mt-1 text-sm font-semibold leading-none text-text">{value}</dd>
    </div>
  );
}

export default async function Home(props: PageProps<"/">) {
  const searchParams = await props.searchParams;
  const tag = firstParam(searchParams.tag);
  const { sort, ascending } = parseSort(firstParam(searchParams.sort));

  // Первая страница берётся прямо в серверном компоненте: клиенту остаётся
  // только подгрузка следующих, никакого водопада на старте.
  const page = await fetchEvents({
    limit: PAGE_SIZE,
    tagSlug: tag,
    sort,
    ascending,
    closed: false,
    active: true,
  }).catch(() => EMPTY);

  const volume24h = page.items.reduce((sum, event) => sum + event.volume24hr, 0);
  const marketCount = page.items.reduce((sum, event) => sum + event.markets.length, 0);

  return (
    <Container className="py-5">
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-bg-subtle px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold leading-tight text-text">
            Рынки предсказаний
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Цена исхода — его вероятность: 62¢ означают 62%. После закрытия
            верный исход гасится по $1, остальные — по $0.
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-faint">
            Демо-режим: баланс и позиции виртуальные, реальные сделки не
            совершаются.
          </p>
        </div>

        <dl className="flex shrink-0 items-center gap-4 sm:gap-5">
          <Stat label="Объём за 24 часа" value={formatVolume(volume24h)} />
          <div className="h-8 w-px shrink-0 bg-border" aria-hidden />
          <Stat label="Активных рынков" value={formatCompact(marketCount)} />
          <div className="hidden h-8 w-px shrink-0 bg-border sm:block" aria-hidden />
          <Stat
            label="Событий в ленте"
            value={formatCompact(page.items.length)}
          />
        </dl>
      </section>

      <div className="mb-3 mt-6 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-text">
          <Flame className="size-4 text-accent" aria-hidden />
          В тренде
        </h2>
        <Link
          href="/markets"
          className="flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-accent"
        >
          Все рынки
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      <InfiniteMarketGrid
        initialPage={page}
        params={{ tag, sort, limit: PAGE_SIZE }}
        ascending={ascending}
        emptyTitle="В этой категории пока пусто"
        emptyDescription="Выберите другую категорию сверху или посмотрите весь список рынков."
      />
    </Container>
  );
}
