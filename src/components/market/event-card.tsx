"use client";

import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, useState, useTransition } from "react";
import { Badge, ChangeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/empty-state";
import { MarketImage } from "@/components/ui/market-image";
import { ProbabilityRing } from "@/components/ui/probability-ring";
import {
  formatCents,
  formatCompact,
  formatTimeLeft,
  formatVolume,
} from "@/lib/format";
import type { Market, MarketEvent, Outcome } from "@/lib/types";
import { cn, eventHref, outcomeColor } from "@/lib/utils";
import { OutcomeRow, type OutcomeSide } from "./outcome-row";
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
  /** Перехват быстрой покупки; по умолчанию — переход на страницу события. */
  onQuickBuy?: QuickBuyHandler;
  className?: string;
}

/**
 * Карточка события в ленте.
 *
 * Ценовая модель на всей карточке одна: вероятности из Gamma `outcomePrices`,
 * где цены исходов одного рынка в сумме дают ровно 1. Исполняемые цены стакана
 * (bestAsk/bestBid со спредом) сюда намеренно не подмешиваются — иначе пара
 * кнопок давала бы 101% и расходилась бы с процентом слева. Спред и цену
 * исполнения показывает страница события.
 */
export function EventCard({ event, onQuickBuy, className }: EventCardProps) {
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

  const binary = event.isBinary;
  // Взаимоисключающие рынки отвечают на один вопрос и выстраиваются в рейтинг.
  // Неисключающее событие — набор независимых ставок: ни лидера, ни раскладки
  // на 100%, поэтому и подписи у него другие. Событие из одного рынка всегда
  // исключающее: исходы внутри рынка взаимоисключающи по определению.
  const exclusive = event.exclusive || event.markets.length === 1;
  const locked = event.closed || primary.closed || !primary.acceptingOrders;
  const yes = primary.outcomes[0];
  const no = primary.outcomes[1];
  const rows = event.markets.slice(0, MAX_ROWS);
  const rest = event.markets.length - rows.length;
  const restForms = exclusive ? OUTCOME_FORMS : BET_FORMS;

  const stop = (handler: () => void) => (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    handler();
  };

  return (
    <article
      className={cn(
        "card group relative flex h-full min-h-[188px] flex-col p-4",
        className,
      )}
    >
      {/* Ссылка-подложка вместо оборачивания карточки: кнопки внутри <a> —
          невалидная разметка, а перекрытие даёт тот же клик по всей площади. */}
      <Link
        href={eventHref(event.slug)}
        aria-label={event.title}
        className="absolute inset-0 rounded-xl"
      />

      <div className="flex items-start gap-3">
        <MarketImage
          src={event.icon ?? event.image}
          alt=""
          size={40}
          className="mt-0.5"
        />

        <div className="min-w-0 flex-1">
          {(event.live || event.isNew) && (
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {event.live && <Badge tone="live">Live</Badge>}
              {event.isNew && <Badge tone="accent">New</Badge>}
            </div>
          )}
          <h3 className="line-clamp-2 text-[13.5px] font-medium leading-snug text-text transition-colors group-hover:text-accent">
            {event.title}
          </h3>
          {!binary && exclusive && (
            <p className="tnum mt-1 text-[11px] text-faint">
              {event.markets.length} {plural(event.markets.length, OUTCOME_FORMS)}
            </p>
          )}
        </div>

        {binary && yes && (
          <ProbabilityRing probability={yes.price} size={52} className="mt-0.5" />
        )}
      </div>

      {binary ? (
        <div className="relative z-10 mt-3.5 grid grid-cols-2 gap-2">
          <Button
            variant="yes"
            size="sm"
            fullWidth
            disabled={locked || !yes || loadingTokenId === yes?.tokenId}
            onClick={stop(() => buy(primary, yes))}
            title={`Buy ${yes?.label ?? "Yes"} · ${formatCents(yes?.price ?? 0, 0)}`}
            className="h-9 px-2.5"
          >
            {loadingTokenId && loadingTokenId === yes?.tokenId ? (
              <Spinner className="size-3.5" />
            ) : (
              <>
                {/* Название исхода усекается, цена — никогда: столбец цен
                    должен читаться при любой длине подписи. */}
                <span className="truncate">{yes?.label ?? "Yes"}</span>
                <span className="tnum shrink-0">{formatCents(yes?.price ?? 0, 0)}</span>
              </>
            )}
          </Button>
          <Button
            variant="no"
            size="sm"
            fullWidth
            disabled={locked || !no || loadingTokenId === no?.tokenId}
            onClick={stop(() => buy(primary, no))}
            title={`Buy ${no?.label ?? "No"} · ${formatCents(no?.price ?? 0, 0)}`}
            className="h-9 px-2.5"
          >
            {loadingTokenId && loadingTokenId === no?.tokenId ? (
              <Spinner className="size-3.5" />
            ) : (
              <>
                <span className="truncate">{no?.label ?? "No"}</span>
                <span className="tnum shrink-0">{formatCents(no?.price ?? 0, 0)}</span>
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          {!exclusive && (
            <p className="tnum text-[11px] font-medium text-faint">
              Ставки события · {event.markets.length}
            </p>
          )}

          {rows.map((market, index) => {
            const label = market.groupTitle ?? market.question;
            // Определившиеся вопросы уже уведены вниз списка (normalizeEvent),
            // но если такой всё же попал в карточку — торговать по нему нечего.
            const settled = !exclusive && isSettled(market);
            const onBuy = (side: OutcomeSide) =>
              buy(market, side === "yes" ? market.outcomes[0] : market.outcomes[1]);
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
                color={outcomeColor(label, index)}
                yesLabel={market.outcomes[0]?.label ?? "Yes"}
                noLabel={market.outcomes[1]?.label ?? "No"}
                settled={settled}
                disabled={event.closed || market.closed || !market.acceptingOrders}
                loadingSide={rowLoadingSide}
                onBuy={onBuy}
              />
            );
          })}

          {rest > 0 && (
            <Link
              href={eventHref(event.slug)}
              className="relative z-10 w-fit text-[11px] font-medium text-muted transition-colors hover:text-accent"
            >
              Ещё {rest} {plural(rest, restForms)} →
            </Link>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3.5">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-faint">
          <span className="tnum whitespace-nowrap">
            {formatVolume(event.volume)} Vol.
          </span>
          <span aria-hidden>·</span>
          <span className="tnum truncate">{formatTimeLeft(event.endDate)}</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Изменение первого рынка — это изменение события только там, где
              рынки взаимоисключающие. У набора независимых ставок «изменения
              события» не существует, поэтому бейдж не показываем. */}
          {(binary || exclusive) && <ChangeBadge change={primary.oneDayPriceChange} />}
          {event.commentCount > 0 && (
            <span className="tnum flex items-center gap-0.5 text-[11px] text-faint">
              <MessageSquare className="size-3" aria-hidden />
              {formatCompact(event.commentCount)}
            </span>
          )}
          <WatchlistButton slug={event.slug} />
        </div>
      </div>
    </article>
  );
}
