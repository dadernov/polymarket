"use client";

import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { Badge, ChangeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

/** Сколько исходов показываем в карточке до ссылки «ещё N». */
const MAX_ROWS = 3;

const OUTCOME_FORMS = ["исход", "исхода", "исходов"] as const;

/** Русское склонение после числа: 1 исход, 2 исхода, 5 исходов. */
function outcomeWord(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return OUTCOME_FORMS[2];
  const mod10 = count % 10;
  if (mod10 === 1) return OUTCOME_FORMS[0];
  if (mod10 >= 2 && mod10 <= 4) return OUTCOME_FORMS[1];
  return OUTCOME_FORMS[2];
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

export function EventCard({ event, onQuickBuy, className }: EventCardProps) {
  const router = useRouter();
  const primary = event.markets[0];
  if (!primary) return null;

  const locked = event.closed || !primary.acceptingOrders;

  const buy = (market: Market, outcome: Outcome | undefined) => {
    if (!outcome) return;
    if (onQuickBuy) {
      onQuickBuy(event, market, outcome);
      return;
    }
    router.push(quickBuyHref(event.slug, outcome.tokenId));
  };

  // Gamma почти всем событиям ставит showAllOutcomes, из-за чего `isBinary`
  // на живых данных почти всегда false. Одиночный рынок на два исхода —
  // бинарный по определению, поэтому подстраховываемся структурной проверкой.
  const binary =
    event.isBinary ||
    (event.markets.length === 1 && primary.outcomes.length === 2);
  const yes = primary.outcomes[0];
  const no = primary.outcomes[1];
  const rows = event.markets.slice(0, MAX_ROWS);
  const rest = event.markets.length - rows.length;

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
          {!binary && (
            <p className="tnum mt-1 text-[11px] text-faint">
              {event.markets.length} {outcomeWord(event.markets.length)}
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
            disabled={locked || !yes}
            onClick={stop(() => buy(primary, yes))}
            className="h-9"
          >
            Buy {yes?.label ?? "Yes"} {formatCents(yes?.price ?? 0, 0)}
          </Button>
          <Button
            variant="no"
            size="sm"
            fullWidth
            disabled={locked || !no}
            onClick={stop(() => buy(primary, no))}
            className="h-9"
          >
            Buy {no?.label ?? "No"} {formatCents(no?.price ?? 0, 0)}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          {rows.map((market, index) => {
            const label = market.groupTitle ?? market.question;
            const onBuy = (side: OutcomeSide) =>
              buy(market, side === "yes" ? market.outcomes[0] : market.outcomes[1]);
            return (
              <OutcomeRow
                key={market.id}
                label={label}
                price={market.outcomes[0]?.price ?? 0}
                noPrice={market.outcomes[1]?.price}
                color={outcomeColor(label, index)}
                yesLabel={market.outcomes[0]?.label ?? "Yes"}
                noLabel={market.outcomes[1]?.label ?? "No"}
                disabled={event.closed || !market.acceptingOrders}
                onBuy={onBuy}
              />
            );
          })}

          {rest > 0 && (
            <Link
              href={eventHref(event.slug)}
              className="relative z-10 w-fit text-[11px] font-medium text-muted transition-colors hover:text-accent"
            >
              Ещё {rest} {outcomeWord(rest)} →
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
          <ChangeBadge change={primary.oneDayPriceChange} />
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
