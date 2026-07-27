import { HeroMarket } from "@/components/home/hero-market";
import { MoversRail } from "@/components/home/movers-rail";
import { moverTokenIds, pickMovers } from "@/components/home/movers";
import { SectionHead, SectionLink } from "@/components/home/section-head";
import { Container } from "@/components/layout/container";
import { InfiniteMarketGrid } from "@/components/market/market-grid";
import { Hint } from "@/components/ui/hint";
import { formatDate, formatVolume } from "@/lib/format";
import { fetchEvents, fetchSparklines } from "@/lib/polymarket";
import type {
  EventSort,
  Market,
  MarketEvent,
  Paginated,
  SparklineMap,
} from "@/lib/types";

export const revalidate = 20;

const PAGE_SIZE = 24;

/** Лента движений ниже трёх плашек выглядит не подборкой, а случайностью. */
const MIN_MOVERS = 3;

/** Сколько ставок показывает герой у события без единой вероятности. */
const HERO_BETS = 3;

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

/* ------------------------------------------------------------------ */
/* Отбор материала: что вынести наверх                                 */
/*                                                                     */
/* Выбор живёт на странице, а не в компонентах: «что сейчас важно» —    */
/* редакторское решение композиции, а герой и лента движений только     */
/* показывают то, что им передали. Заодно правило остаётся серверным:   */
/* из «use client»-модуля его нельзя было бы вызвать при рендере.       */
/* ------------------------------------------------------------------ */

/**
 * Есть ли у события единая вероятность. Взаимоисключающие рынки отвечают на
 * один вопрос: сработает ровно один, и лидер рейтинга — это и есть главное
 * число события. Событие из одного рынка исключающее по определению.
 */
function isRanked(event: MarketEvent): boolean {
  return event.exclusive || event.markets.length === 1;
}

/**
 * Цена у самой границы: рынок фактически решён. Крупно показывать «<1%»
 * нечего — верхний экран должен нести вопрос, у которого ещё есть ответ.
 */
function isDecided(price: number): boolean {
  return price <= 0.02 || price >= 0.98;
}

/**
 * Верхние ставки события без единой вероятности — самые торгуемые за сутки.
 * Именно оборот, а не цена: у набора независимых ставок цены несравнимы, зато
 * оборот прямо говорит, какой вопрос люди сейчас решают.
 */
function heroBets(event: MarketEvent): Market[] {
  return [...event.markets]
    .sort((a, b) => b.volume24hr - a.volume24hr)
    .slice(0, HERO_BETS);
}

/**
 * Есть ли герою что показать крупно. Событие, чьи главные рынки уже решены
 * (матч отыгран, порог пройден), формально остаётся самым оборотистым, но
 * открывать им страницу нельзя: решённое число ничего не предсказывает.
 */
function isLively(event: MarketEvent): boolean {
  if (isRanked(event)) {
    return !isDecided(event.markets[0]?.outcomes[0]?.price ?? 0);
  }
  return heroBets(event).filter((m) => !isDecided(m.outcomes[0]?.price ?? 0)).length >= 2;
}

/**
 * Главный вопрос дня — событие с наибольшим оборотом за сутки. Берётся из той
 * же выборки, что и лента: отдельный запрос ради одной карточки не нужен,
 * а «первое по обороту» остаётся верным при любой сортировке ленты.
 */
function pickHero(events: MarketEvent[]): MarketEvent | null {
  let best: MarketEvent | null = null;
  let fallback: MarketEvent | null = null;
  for (const event of events) {
    if (event.closed || !event.markets.length) continue;
    // Герою нужен торгуемый исход: иначе крупный блок с кнопками ведёт в никуда.
    if (!event.markets[0]?.outcomes[0]?.tokenId) continue;
    if (!fallback || event.volume24hr > fallback.volume24hr) fallback = event;
    if (!isLively(event)) continue;
    if (!best || event.volume24hr > best.volume24hr) best = event;
  }
  // Оборот выбирает героя, но решённое событие уступает живому.
  return best ?? fallback;
}

function tokenIdsOf(markets: Market[]): string[] {
  const ids: string[] = [];
  for (const market of markets) {
    const tokenId = market.outcomes[0]?.tokenId;
    if (tokenId) ids.push(tokenId);
  }
  return ids;
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

  // Герой и лента движений собираются из той же выборки — второй запрос
  // событий ради них не нужен.
  const hero = pickHero(page.items);
  // Пустой список ставок означает, что у героя есть единое главное число.
  const bets = hero && !isRanked(hero) ? heroBets(hero) : [];
  const movers = pickMovers(page.items, { exclude: hero?.id });

  // Ряды цен для верхнего экрана берём на сервере одним пакетом: это два
  // самых заметных блока страницы, и в первом кадре они должны быть
  // с траекториями, а не с пустыми местами под них.
  const heroMarkets = hero ? (bets.length ? bets : hero.markets.slice(0, 1)) : [];
  const tokens = [...tokenIdsOf(heroMarkets), ...moverTokenIds(movers)];
  const series: SparklineMap = tokens.length
    ? await fetchSparklines(tokens).catch((): SparklineMap => ({}))
    : {};

  // Герой показан крупно — в сетке он был бы вторым упоминанием подряд.
  const gridPage = hero
    ? { ...page, items: page.items.filter((event) => event.id !== hero.id) }
    : page;

  const volume24h = page.items.reduce((sum, event) => sum + event.volume24hr, 0);

  return (
    <Container className="py-6 sm:py-8">
      {/* Шапка номера: дата, оборот подборки и одна строка ликбеза. Правило
          «цена = вероятность» новичку нужно ровно один раз и ненавязчиво —
          дальше страница говорит числами. */}
      <header className="rule pb-5">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-faint">
          <span className="tnum">{formatDate(new Date().toISOString())}</span>
          <span aria-hidden>·</span>
          <span className="tnum">оборот подборки {formatVolume(volume24h)}</span>
          <span aria-hidden>·</span>
          <span>демо-режим</span>
        </p>

        <div className="mt-3.5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          {/* Заголовок страницы намеренно меньше вопроса дня: главный объект
              экрана — вопрос, а не название раздела. */}
          <h1 className="display text-[24px] leading-none text-text sm:text-[30px]">
            Что сейчас важно
          </h1>
          <p className="max-w-[68ch] text-xs leading-relaxed text-muted">
            Цена исхода — это его вероятность: 62¢ значат 62%. После закрытия
            верный исход гасится по $1, остальные — по $0.{" "}
            {/* Всплывающая подсказка шириной 224px не умеет прижиматься
                к краю окна: на узком экране она бы вылезла за него и дала
                странице горизонтальную прокрутку. Текст рядом самодостаточен,
                подсказка — только дополнение. */}
            <Hint className="hidden sm:inline-flex">
              Купив «Yes» по 62¢, вы получаете $1 при верном исходе — это 61%
              дохода на вложенное — и $0 при неверном.
            </Hint>{" "}
            Баланс и сделки здесь виртуальные: реальные ставки не совершаются.
          </p>
        </div>
      </header>

      {hero && (
        <HeroMarket event={hero} bets={bets} series={series} className="mt-6" />
      )}

      {movers.length >= MIN_MOVERS && (
        <section className="mt-10 sm:mt-12">
          <SectionHead
            kicker="24 часа"
            title="Куда двинулось"
            description="События, где вероятность за сутки сдвинулась сильнее всего. Рядом с дельтой — траектория за неделю: по ней видно, разовый это скачок или тренд."
          />
          <MoversRail movers={movers} series={series} className="mt-4" />
        </section>
      )}

      <section className="mt-10 sm:mt-12">
        <SectionHead
          title="Все рынки"
          description={`Полный список активных событий выбранной категории — по ${PAGE_SIZE} за раз, дальше лента подгружается по кнопке.`}
          action={<SectionLink href="/markets">Фильтры и сортировка</SectionLink>}
        />
        <InfiniteMarketGrid
          className="mt-5"
          initialPage={gridPage}
          params={{ tag, sort, limit: PAGE_SIZE }}
          ascending={ascending}
          emptyTitle="В этой категории пока пусто"
          emptyDescription="Выберите другую категорию сверху или посмотрите весь список рынков."
        />
      </section>
    </Container>
  );
}
