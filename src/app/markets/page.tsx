import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { InfiniteMarketGrid } from "@/components/market/market-grid";
import { ClosedToggle, SortSelect } from "@/components/market/sort-select";
import { formatCompact } from "@/lib/format";
import { fetchEvents } from "@/lib/polymarket";
import type { EventSort, MarketEvent, Paginated } from "@/lib/types";

export const revalidate = 20;

export const metadata: Metadata = {
  title: "Все рынки",
  description:
    "Полный список рынков предсказаний: сортировка по объёму, ликвидности и дате закрытия.",
};

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

export default async function MarketsPage(props: PageProps<"/markets">) {
  const searchParams = await props.searchParams;
  const tag = firstParam(searchParams.tag);
  const { sort, ascending } = parseSort(firstParam(searchParams.sort));
  const closed = firstParam(searchParams.closed) === "true";

  const page = await fetchEvents({
    limit: PAGE_SIZE,
    tagSlug: tag,
    sort,
    ascending,
    closed,
    // Закрытые события уже неактивны — с active=true фильтр отдаёт пустоту.
    active: !closed,
  }).catch(() => EMPTY);

  return (
    <Container className="py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight text-text">
            {closed ? "Завершённые рынки" : "Все рынки"}
          </h1>
          <p className="tnum mt-1 text-xs text-muted">
            {formatCompact(page.items.length)}
            {page.hasMore ? "+" : ""} событий в подборке
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SortSelect />
          <ClosedToggle />
        </div>
      </div>

      <div className="mt-5">
        <InfiniteMarketGrid
          initialPage={page}
          params={{ tag, sort, limit: PAGE_SIZE, closed }}
          ascending={ascending}
          emptyTitle={closed ? "Завершённых рынков нет" : "Рынков не нашлось"}
          emptyDescription="Смените категорию или сортировку — фильтры хранятся прямо в адресе страницы."
        />
      </div>
    </Container>
  );
}
