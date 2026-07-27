import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { InfiniteMarketGrid } from "@/components/market/market-grid";
import {
  ClosedToggle,
  MarketSearch,
  SortSelect,
} from "@/components/market/sort-select";
import { Stat, StatRow } from "@/components/ui/stat";
import { formatCompact, formatVolume } from "@/lib/format";
import { fetchEvents, search as searchEvents } from "@/lib/polymarket";
import type { MarketEvent, Paginated } from "@/lib/types";

export const revalidate = 20;

export const metadata: Metadata = {
  title: "Каталог рынков",
  description:
    "Полный каталог рынков вероятностей: поиск по названию, сортировка по объёму, ликвидности и близости закрытия, архив завершённых событий.",
};

const PAGE_SIZE = 24;

const EMPTY: Paginated<MarketEvent> = { items: [], hasMore: false, nextOffset: 0 };

/** Ключи сортировки, которые понимает лента; подписи к ним — в <SortSelect/>. */
const SORT_KEYS = ["volume24hr", "volume", "liquidity", "endDate", "competitive"] as const;

type SortKey = (typeof SORT_KEYS)[number];

/**
 * Как признак сортировки называется в строке состояния подборки. Отдельно от
 * подписей селекта: там подпись поля («Общий объём»), здесь — часть фразы
 * («отсортировано по общему объёму»).
 */
const SORT_SUMMARY: Record<SortKey, string> = {
  volume24hr: "по объёму за сутки",
  volume: "по общему объёму",
  liquidity: "по ликвидности",
  endDate: "по близости закрытия",
  competitive: "по спорности исхода",
};

function parseSort(value: string | undefined): { sort: SortKey; ascending: boolean } {
  const sort = SORT_KEYS.find((key) => key === value) ?? "volume24hr";
  // «Скоро закрытие» — единственная сортировка по возрастанию.
  return { sort, ascending: sort === "endDate" };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Русское склонение после числа: 1 событие, 2 события, 5 событий. */
function pluralEvents(count: number): string {
  const forms = ["событие", "события", "событий"] as const;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = count % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

/** Слаг категории через дефисы читается как фраза, а не как кусок адреса. */
function tagLabel(slug: string): string {
  return slug.replace(/-/g, " ");
}

export default async function MarketsPage(props: PageProps<"/markets">) {
  const searchParams = await props.searchParams;
  const tag = firstParam(searchParams.tag);
  const { sort, ascending } = parseSort(firstParam(searchParams.sort));
  const closed = firstParam(searchParams.closed) === "true";
  const query = (firstParam(searchParams.q) ?? "").trim();

  // Поиск — другой апстрим: он не пагинируется и не знает про категории и
  // сортировку, поэтому подборка собирается по одной из двух ветвей.
  const page = query
    ? await searchEvents(query, PAGE_SIZE)
        .then<Paginated<MarketEvent>>((result) => ({
          items: result.events,
          hasMore: false,
          nextOffset: result.events.length,
        }))
        .catch(() => EMPTY)
    : await fetchEvents({
        limit: PAGE_SIZE,
        tagSlug: tag,
        sort,
        ascending,
        closed,
        // Закрытые события уже неактивны — с active=true фильтр отдаёт пустоту.
        active: !closed,
      }).catch(() => EMPTY);

  // Запрос сильнее фильтра архива: поиск отдаёт только активные события, и
  // подборка на экране — результат поиска, чем бы ни был занят переключатель.
  const archive = closed && !query;

  const eventCount = page.items.length;
  const marketCount = page.items.reduce((sum, event) => sum + event.markets.length, 0);
  const volume = page.items.reduce(
    (sum, event) => sum + (archive ? event.volume : event.volume24hr),
    0,
  );

  const title = query ? "Поиск по каталогу" : archive ? "Архив рынков" : "Каталог рынков";
  const lede = query
    ? "Поиск идёт по названиям активных событий во всех категориях — выбранная категория и сортировка к нему не применяются."
    : archive
      ? "Завершённые события: цены здесь уже не двигаются. По ним видно, насколько рынок угадал исход заранее."
      : "Все события целиком, а не только лента главной. Цена исхода — это его вероятность: 62¢ читаются как 62%. Фильтры хранятся в адресе — подборку можно переслать ссылкой.";

  return (
    <Container className="py-7 sm:py-9">
      {/* Не <header>: внутри <main> он даёт второй landmark «banner» и путает скринридер. */}
      <div className="rule pb-6">
        <p className="text-[10.5px] font-semibold uppercase leading-none tracking-[0.18em] text-faint">
          {archive ? "Архив" : "Каталог"}
        </p>

        <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <h1 className="display text-[30px] leading-[1.05] text-text sm:text-[38px]">
              {title}
            </h1>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{lede}</p>
          </div>

          <StatRow className="shrink-0">
            <Stat
              label={query ? "Найдено" : "Событий"}
              value={`${formatCompact(eventCount)}${page.hasMore ? "+" : ""}`}
              size="sm"
            />
            <Stat label="Рынков" value={formatCompact(marketCount)} size="sm" />
            <Stat
              label={archive ? "Объём всего" : "Объём 24ч"}
              value={formatVolume(volume)}
              size="sm"
            />
          </StatRow>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <MarketSearch className="w-full sm:w-[300px]" />
          <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
            <SortSelect />
            <ClosedToggle />
          </div>
        </div>

        {/* Состояние фильтров словами: иначе его приходится вычитывать из адреса. */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-muted">
          {query ? (
            <>
              <span>
                <span className="tnum font-semibold text-text">
                  {formatCompact(eventCount)}
                </span>{" "}
                {pluralEvents(eventCount)} по запросу
              </span>
              <span className="font-semibold text-text">«{query}»</span>
            </>
          ) : (
            <>
              <span>
                В подборке{" "}
                <span className="tnum font-semibold text-text">
                  {formatCompact(eventCount)}
                  {page.hasMore ? "+" : ""}
                </span>{" "}
                {pluralEvents(eventCount)}
              </span>
              <span className="text-faint" aria-hidden>
                ·
              </span>
              <span>отсортировано {SORT_SUMMARY[sort]}</span>
              <span className="text-faint" aria-hidden>
                ·
              </span>
              <span>
                {tag && tag !== "all" ? (
                  <>
                    категория{" "}
                    <span className="font-semibold text-text">{tagLabel(tag)}</span>
                  </>
                ) : (
                  "все категории"
                )}
              </span>
            </>
          )}
        </p>
      </div>

      <div className="mt-6">
        <InfiniteMarketGrid
          initialPage={page}
          params={{ tag, sort, limit: PAGE_SIZE, closed, q: query || undefined }}
          ascending={ascending}
          emptyTitle={
            query
              ? "По запросу ничего не нашлось"
              : closed
                ? "В архиве этой категории пусто"
                : "Рынков не нашлось"
          }
          emptyDescription={
            query
              ? "Попробуйте короче и по-английски: названия событий приходят от Polymarket на английском."
              : "Смените категорию или сортировку — фильтры хранятся прямо в адресе страницы."
          }
        />
      </div>
    </Container>
  );
}
