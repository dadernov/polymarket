"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, useState, useTransition } from "react";
import { Badge, ChangeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/empty-state";
import { MarketImage } from "@/components/ui/market-image";
import { ProbabilityRing } from "@/components/ui/probability-ring";
import { Sparkline } from "@/components/ui/sparkline";
import { formatCents, formatTimeLeft, formatVolume } from "@/lib/format";
import type {
  Market,
  MarketEvent,
  Outcome,
  SparklineMap,
} from "@/lib/types";
import { cn, eventHref } from "@/lib/utils";
import { OutcomeRow, isImplicitPair, type OutcomeSide } from "./outcome-row";
import { WatchlistButton } from "./watchlist-button";

/** Сколько строк показываем в карточке до ссылки «ещё N». */
const MAX_ROWS = 3;

type PluralForms = readonly [string, string, string];

const OUTCOME_FORMS: PluralForms = ["исход", "исхода", "исходов"];
const BET_FORMS: PluralForms = ["ставка", "ставки", "ставок"];

/** Русское склонение после числа: 1 исход, 2 исхода, 5 исходов. */
function plural(count: number, forms: PluralForms): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = count % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

/** Рынок фактически определился: цена «за» выродилась в 0/1 или торги закрыты. */
function isSettled(market: Market): boolean {
  const price = market.outcomes[0]?.price ?? 0;
  return market.closed || price >= 1 || price <= 0;
}

/**
 * Есть ли у события рейтинг исходов. Взаимоисключающие рынки отвечают на один
 * вопрос: сработает ровно один, сумма цен ≈ 1, их можно ранжировать. Событие
 * из одного рынка всегда исключающее — исходы внутри рынка взаимоисключающи
 * по определению.
 */
function isRanked(event: MarketEvent): boolean {
  return event.exclusive || event.markets.length === 1;
}

/**
 * Токен главного числа карточки: «Yes» бинарного рынка или лидер рейтинга.
 * У набора независимых ставок такого числа нет — там своя траектория у каждой
 * строки, поэтому null.
 */
export function headlineTokenId(event: MarketEvent): string | null {
  if (!isRanked(event)) return null;
  return event.markets[0]?.outcomes[0]?.tokenId ?? null;
}

/**
 * Все токены, для которых карточке нужны ряды цен. Карточка объявляет свою
 * потребность, а запрашивает их сетка — одним пакетом на весь видимый список.
 */
export function cardTokenIds(event: MarketEvent): string[] {
  if (isRanked(event)) {
    const headline = headlineTokenId(event);
    return headline ? [headline] : [];
  }
  const ids: string[] = [];
  for (const market of event.markets.slice(0, MAX_ROWS)) {
    const id = market.outcomes[0]?.tokenId;
    if (id) ids.push(id);
  }
  return ids;
}

export type QuickBuyHandler = (
  event: MarketEvent,
  market: Market,
  outcome: Outcome,
) => void;

/**
 * Ссылка на событие с предзаполненной сделкой. Быстрая покупка с карточки не
 * открывает модалку, а ведёт на страницу события — так состояние остаётся
 * в URL и им можно поделиться.
 */
export function quickBuyHref(slug: string, tokenId: string | null): string {
  const base = eventHref(slug);
  if (!tokenId) return base;
  return `${base}?outcome=${encodeURIComponent(tokenId)}&side=BUY`;
}

export interface EventCardProps {
  event: MarketEvent;
  /**
   * Траектория главного числа карточки — ряд для `headlineTokenId(event)`.
   * Данные могут не приехать: без них карточка полна, место просто пустует.
   */
  points?: number[];
  /**
   * Ряды по tokenId для строк набора независимых ставок: у каждого вопроса
   * своя история, общего числа события у него нет.
   */
  series?: SparklineMap;
  /** Перехват быстрой покупки; по умолчанию — переход на страницу события. */
  onQuickBuy?: QuickBuyHandler;
  className?: string;
}

/**
 * Карточка события в ленте.
 *
 * Иерархия: вероятность (крупная антиква) → вопрос → траектория → служебная
 * строка внизу. Три типа событий подаются по-разному, потому что различаются
 * по смыслу: бинарный рынок — кольцо и две кнопки; взаимоисключающее событие —
 * рейтинг исходов с полосами; набор независимых ставок — список отдельных
 * вопросов без рейтинга и без «изменения события».
 *
 * Ценовая модель на всей карточке одна: вероятности из Gamma `outcomePrices`,
 * где цены исходов одного рынка в сумме дают ровно 1. Исполняемые цены стакана
 * (bestAsk/bestBid со спредом) сюда намеренно не подмешиваются — иначе пара
 * кнопок давала бы 101% и расходилась бы с процентом слева. Спред и цену
 * исполнения показывает страница события.
 */
export function EventCard({
  event,
  points,
  series,
  onQuickBuy,
  className,
}: EventCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Переход на страницу события — это полноценная навигация, а не мгновенное
  // локальное состояние: без спиннера на нажатой кнопке клик выглядит так,
  // будто ничего не произошло секунду-другую.
  const [pendingTokenId, setPendingTokenId] = useState<string | null>(null);
  const primary = event.markets[0];
  if (!primary) return null;

  const buy = (market: Market, outcome: Outcome | undefined) => {
    if (!outcome) return;
    if (onQuickBuy) {
      onQuickBuy(event, market, outcome);
      return;
    }
    setPendingTokenId(outcome.tokenId);
    startTransition(() => {
      router.push(quickBuyHref(event.slug, outcome.tokenId));
    });
  };

  const loadingTokenId = isPending ? pendingTokenId : null;
  // Рынок без clobTokenIds отдаёт tokenId === null у обоих исходов: сравнение
  // «null === null» иначе зажигало бы спиннер на кнопке без всякого клика.
  const isLoadingOutcome = (outcome: Outcome | undefined) =>
    loadingTokenId !== null && loadingTokenId === outcome?.tokenId;

  const binary = event.isBinary;
  const ranked = isRanked(event);
  const locked = event.closed || primary.closed || !primary.acceptingOrders;
  const yes = primary.outcomes[0];
  const no = primary.outcomes[1];
  const yesLabel = yes?.label ?? "Yes";
  const noLabel = no?.label ?? "No";
  // Имена команд и кандидатов на кнопке вытесняют цену — тогда выносим их
  // строкой выше, а на кнопках оставляем только центы. Для Yes/No подпись
  // не нужна: цвет кнопки читается однозначно.
  const namedPair = !isImplicitPair(yesLabel, noLabel);
  const rows = event.markets.slice(0, MAX_ROWS);
  const rest = event.markets.length - rows.length;
  const forms = ranked ? OUTCOME_FORMS : BET_FORMS;

  // Надзаголовок отвечает на вопрос «что это за набор»: рейтинг исходов или
  // независимые ставки. Это единственная подпись, различающая типы словами.
  const kicker = binary
    ? null
    : ranked
      ? `${event.markets.length} ${plural(event.markets.length, OUTCOME_FORMS)}`
      : `Ставки события · ${event.markets.length}`;

  const stop = (handler: () => void) => (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    handler();
  };

  const sideButton = (outcome: Outcome | undefined, label: string, side: OutcomeSide) => {
    const price = outcome?.price ?? 0;
    const cents = formatCents(price, 0);
    return (
      <Button
        variant={side}
        size="sm"
        fullWidth
        disabled={locked || !outcome || isLoadingOutcome(outcome)}
        onClick={stop(() => buy(primary, outcome))}
        title={`${label} · ${cents}`}
        aria-label={`${label} по ${cents}`}
        className="h-10 px-3"
      >
        {isLoadingOutcome(outcome) ? (
          <Spinner className="size-3.5" />
        ) : namedPair ? (
          <span className="tnum">{cents}</span>
        ) : (
          <>
            {/* Название исхода усекается, цена — никогда: столбец цен
                должен читаться при любой длине подписи. */}
            <span className="truncate">{label}</span>
            <span className="tnum shrink-0">{cents}</span>
          </>
        )}
      </Button>
    );
  };

  return (
    <article
      className={cn(
        "card card-interactive group relative flex h-full min-h-[212px] flex-col p-5",
        className,
      )}
    >
      {/* Ссылка-подложка вместо оборачивания карточки: кнопки внутри <a> —
          невалидная разметка, а перекрытие даёт тот же клик по всей площади. */}
      <Link
        href={eventHref(event.slug)}
        aria-label={event.title}
        className="absolute inset-0 rounded-[16px]"
      />

      <header className="flex items-start gap-3.5">
        <MarketImage
          src={event.icon ?? event.image}
          alt=""
          size={44}
          className="mt-0.5 rounded-xl"
        />

        <div className="min-w-0 flex-1">
          {(event.live || event.isNew || kicker) && (
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              {event.live && <Badge tone="live">Live</Badge>}
              {event.isNew && <Badge tone="accent">Новое</Badge>}
              {kicker && (
                <span className="tnum text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
                  {kicker}
                </span>
              )}
            </div>
          )}
          <h3 className="line-clamp-3 text-[15px] font-semibold leading-[1.32] text-text">
            {event.title}
          </h3>
        </div>
      </header>

      {/* Тело карточки центрируется по вертикали: в ряду сетки карточки
          растягиваются до самой высокой, и у короткой (бинарной) иначе
          образуется провал над служебной строкой. Свободное место делится
          симметрично — это читается как воздух, а не как дефект. */}
      <div className="my-auto flex flex-col pt-5">
        {binary ? (
          <>
            {/* Число и его траектория — два главных объекта карточки, между
                ними воздух, а не служебные подписи. */}
            <div className="flex items-center justify-between gap-4">
              <ProbabilityRing probability={yes?.price ?? 0} size={80} />
              <Sparkline points={points ?? []} width={128} height={46} dot />
            </div>

            {namedPair && (
              <div className="mt-4 flex items-baseline justify-between gap-3 text-[11.5px] leading-tight">
                <span className="truncate font-medium text-yes">{yesLabel}</span>
                <span className="truncate font-medium text-no">{noLabel}</span>
              </div>
            )}

            <div
              className={cn(
                "relative z-10 grid grid-cols-2 gap-2.5",
                namedPair ? "mt-2" : "mt-5",
              )}
            >
              {sideButton(yes, yesLabel, "yes")}
              {sideButton(no, noLabel, "no")}
            </div>
          </>
        ) : (
          <>
            <div
              className={cn(
                "flex flex-col",
                // Рейтинг читается как один список — строки идут подряд.
                // Независимые ставки — разные вопросы, между ними линовка.
                ranked
                  ? "gap-4"
                  : "gap-3 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-3",
              )}
            >
              {rows.map((market, index) => {
                const label = market.groupTitle ?? market.question;
                // Определившиеся вопросы уже уведены вниз списка (normalizeEvent),
                // но если такой всё же попал в карточку — торговать по нему нечего.
                const settled = !ranked && isSettled(market);
                const tokenId = market.outcomes[0]?.tokenId;
                const rowPoints = ranked
                  ? index === 0
                    ? points
                    : undefined
                  : tokenId
                    ? series?.[tokenId]
                    : undefined;
                const rowLoadingSide: OutcomeSide | null = !loadingTokenId
                  ? null
                  : loadingTokenId === market.outcomes[0]?.tokenId
                    ? "yes"
                    : loadingTokenId === market.outcomes[1]?.tokenId
                      ? "no"
                      : null;
                return (
                  <OutcomeRow
                    key={market.id}
                    label={label}
                    price={market.outcomes[0]?.price ?? 0}
                    noPrice={market.outcomes[1]?.price}
                    yesLabel={market.outcomes[0]?.label ?? "Yes"}
                    noLabel={market.outcomes[1]?.label ?? "No"}
                    variant={ranked ? "ranked" : "question"}
                    rank={ranked ? index + 1 : undefined}
                    lead={ranked && index === 0}
                    points={rowPoints}
                    settled={settled}
                    disabled={event.closed || market.closed || !market.acceptingOrders}
                    loadingSide={rowLoadingSide}
                    onBuy={(side) =>
                      buy(market, side === "yes" ? market.outcomes[0] : market.outcomes[1])
                    }
                  />
                );
              })}
            </div>

            {rest > 0 && (
              <Link
                href={eventHref(event.slug)}
                className="relative z-10 mt-3.5 w-fit text-[11.5px] font-medium text-muted transition-colors hover:text-accent"
              >
                Ещё {rest} {plural(rest, forms)} →
              </Link>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-muted">
          <span className="tnum whitespace-nowrap">
            Объём {formatVolume(event.volume)}
          </span>
          <span className="text-faint" aria-hidden>
            ·
          </span>
          <span className="tnum truncate">{formatTimeLeft(event.endDate)}</span>
          {/* Изменение первого рынка — это изменение события только там, где
              рынки взаимоисключающие. У набора независимых ставок «изменения
              события» не существует, поэтому дельту не показываем. */}
          {ranked && (
            <>
              <span className="text-faint" aria-hidden>
                ·
              </span>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
                <ChangeBadge change={primary.oneDayPriceChange} />
                <span className="text-faint">п.п.</span>
              </span>
            </>
          )}
        </div>

        {/* Счётчика комментариев здесь нет намеренно: служебная строка несёт
            объём, срок и дельту, а социальные метрики уводили её в четыре
            ряда мелкого серого текста — приём, от которого мы ушли. */}
        <WatchlistButton slug={event.slug} />
      </div>
    </article>
  );
}
