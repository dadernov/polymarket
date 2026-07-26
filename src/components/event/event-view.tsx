"use client";

/**
 * Клиентская оболочка страницы события: держит выбор «рынок + исход» и
 * раздаёт его графику, списку исходов, вкладкам и стакану. Выбор дублируется
 * в query-строку (`?outcome=<tokenId>`) — по такой ссылке страница открывается
 * уже на нужном исходе, как и по диплинку с карточки на главной.
 */

import { useCallback, useState } from "react";

import { EventHeader } from "@/components/event/event-header";
import { EventTabs } from "@/components/event/event-tabs";
import { OutcomeList, type OutcomeSelection } from "@/components/event/outcome-list";
import { PriceChart } from "@/components/event/price-chart";
import { RelatedEvents } from "@/components/event/related-events";
import { OrderBookPanel } from "@/components/trade/order-book-panel";
import { TradePanel } from "@/components/trade/trade-panel";
import { EmptyState } from "@/components/ui/empty-state";
import type { Side } from "@/lib/pricing";
import type { Market, MarketEvent, Outcome } from "@/lib/types";

export interface EventViewProps {
  event: MarketEvent;
  related: MarketEvent[];
  /** tokenId исхода из ссылки-диплинка с карточки на главной. */
  initialTokenId?: string;
  /** `BUY` | `SELL` из карточки на главной; терпим и `yes` | `no`. */
  initialSide?: string;
}

function initialSelection(
  event: MarketEvent,
  tokenId?: string,
  side?: string,
): OutcomeSelection {
  if (tokenId) {
    for (const market of event.markets) {
      const outcome = market.outcomes.find((o) => o.tokenId === tokenId);
      if (outcome) return { marketId: market.id, outcomeIndex: outcome.index };
    }
  }

  const market = event.markets[0];
  if (!market) return { marketId: "", outcomeIndex: 0 };

  const normalized = side?.trim().toLowerCase();
  const wantsSecond = normalized === "no" || normalized === "sell" || normalized === "1";
  return {
    marketId: market.id,
    outcomeIndex: wantsSecond && market.outcomes.length > 1 ? 1 : 0,
  };
}

/** Панель сделки ждёт BUY/SELL; всё, кроме явного sell, считаем покупкой. */
function initialTradeSide(side?: string): Side {
  return side?.trim().toLowerCase() === "sell" ? "SELL" : "BUY";
}

/**
 * Пишем выбор в адресную строку без перезагрузки — ссылку можно скопировать
 * и она откроется на том же исходе. `side` (BUY/SELL) не трогаем: его ставит
 * карточка на главной, а исход однозначно задаётся токеном.
 */
function syncUrl(outcome: Outcome): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (outcome.tokenId) url.searchParams.set("outcome", outcome.tokenId);
  else url.searchParams.delete("outcome");
  window.history.replaceState(window.history.state, "", url.toString());
}

export function EventView({
  event,
  related,
  initialTokenId,
  initialSide,
}: EventViewProps) {
  const [selection, setSelection] = useState<OutcomeSelection>(() =>
    initialSelection(event, initialTokenId, initialSide),
  );

  const handleSelect = useCallback((market: Market, outcome: Outcome) => {
    setSelection({ marketId: market.id, outcomeIndex: outcome.index });
    syncUrl(outcome);
  }, []);

  // Обратная связь от панели сделки: там свой список рынков, держим их вместе.
  const handleMarketFromPanel = useCallback((next: Market) => {
    setSelection((prev) =>
      prev.marketId === next.id ? prev : { marketId: next.id, outcomeIndex: 0 },
    );
  }, []);

  const market =
    event.markets.find((m) => m.id === selection.marketId) ?? event.markets[0] ?? null;
  const outcome = market
    ? (market.outcomes[selection.outcomeIndex] ?? market.outcomes[0] ?? null)
    : null;

  if (!market) {
    return (
      <div className="space-y-5">
        <EventHeader event={event} />
        <EmptyState
          title="Рынки недоступны"
          description="У этого события нет активных рынков — вероятно, торги уже завершены."
        />
        <RelatedEvents events={related} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
      {/* Верх левой колонки */}
      <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-1">
        <EventHeader event={event} />
        <PriceChart event={event} activeMarketId={market.id} />
      </div>

      {/* Правая колонка: на узких экранах уезжает сразу под график */}
      <aside className="min-w-0 space-y-4 self-start lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-20">
        <TradePanel
          event={event}
          initialTokenId={initialTokenId}
          initialSide={initialTradeSide(initialSide)}
          selectedMarket={market}
          onSelectMarket={handleMarketFromPanel}
        />
        {outcome?.tokenId && (
          <OrderBookPanel
            tokenId={outcome.tokenId}
            tickSize={market.tickSize}
            outcomeLabel={outcome.label}
          />
        )}
      </aside>

      {/* Низ левой колонки */}
      <div className="min-w-0 space-y-7 lg:col-start-1 lg:row-start-2">
        <OutcomeList event={event} selected={selection} onSelect={handleSelect} />
        <EventTabs event={event} market={market} />
        <RelatedEvents events={related} />
      </div>
    </div>
  );
}
