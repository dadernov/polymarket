"use client";

/**
 * Клиентская оболочка страницы события и единственный владелец выбора
 * «рынок + исход». График, список исходов, панель сделки и стакан читают одну
 * и ту же пару, поэтому разъехаться им негде.
 *
 * Выбор дублируется в query-строку (`?outcome=<tokenId>`): по такой ссылке
 * страница открывается на нужном исходе, как и по диплинку с карточки.
 */

import { useCallback, useEffect, useState } from "react";

import { EventHeader } from "@/components/event/event-header";
import { EventTabs } from "@/components/event/event-tabs";
import { OutcomeList, type OutcomeSelection } from "@/components/event/outcome-list";
import { PriceChart } from "@/components/event/price-chart";
import { RelatedEvents } from "@/components/event/related-events";
import { TradePanel } from "@/components/trade/trade-panel";
import { EmptyState } from "@/components/ui/empty-state";
import type { Side } from "@/lib/pricing";
import type { Market, MarketEvent, Outcome } from "@/lib/types";

export interface EventViewProps {
  event: MarketEvent;
  related: MarketEvent[];
  /** tokenId исхода из ссылки-диплинка с карточки на главной. */
  initialTokenId?: string;
  /** `BUY` | `SELL` из карточки на главной. */
  initialSide?: string;
}

/**
 * Диплинк применяем, только если токен действительно принадлежит одному из
 * рынков события. Чужой или протухший — молча игнорируем и берём первый рынок,
 * на котором вообще можно торговать.
 */
function initialSelection(event: MarketEvent, tokenId?: string): OutcomeSelection {
  if (tokenId) {
    for (const market of event.markets) {
      const outcome = market.outcomes.find((item) => item.tokenId === tokenId);
      if (outcome) return { marketId: market.id, outcomeIndex: outcome.index };
    }
  }

  const tradable = event.markets.find(
    (market) =>
      !event.closed &&
      !market.closed &&
      market.acceptingOrders &&
      market.outcomes.some((item) => item.tokenId),
  );
  const fallback =
    tradable ??
    event.markets.find((market) => market.outcomes.some((item) => item.tokenId)) ??
    event.markets[0];

  return { marketId: fallback?.id ?? "", outcomeIndex: 0 };
}

/** Панель сделки ждёт BUY/SELL; всё, кроме явного sell, считаем покупкой. */
function initialTradeSide(side?: string): Side {
  return side?.trim().toLowerCase() === "sell" ? "SELL" : "BUY";
}

/**
 * Пишем выбор в адресную строку без перезагрузки — ссылку можно скопировать
 * и она откроется на том же исходе. Заодно вычищает неверный `?outcome=`
 * из диплинка: в адресе всегда то, что реально на экране.
 */
function syncUrl(outcome: Outcome | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (outcome?.tokenId) url.searchParams.set("outcome", outcome.tokenId);
  else url.searchParams.delete("outcome");
  if (url.toString() === window.location.href) return;
  window.history.replaceState(window.history.state, "", url.toString());
}

export function EventView({
  event,
  related,
  initialTokenId,
  initialSide,
}: EventViewProps) {
  const [selection, setSelection] = useState<OutcomeSelection>(() =>
    initialSelection(event, initialTokenId),
  );

  // Нормализуем на каждом рендере: индекс мог остаться от рынка с другим
  // числом исходов, а рынок — исчезнуть из ответа Gamma.
  const market =
    event.markets.find((item) => item.id === selection.marketId) ?? event.markets[0] ?? null;
  const outcomeIndex = market?.outcomes[selection.outcomeIndex] ? selection.outcomeIndex : 0;
  const outcome = market?.outcomes[outcomeIndex] ?? null;

  const select = useCallback((next: Market, index: number) => {
    setSelection({ marketId: next.id, outcomeIndex: index });
  }, []);

  const handleListSelect = useCallback(
    (next: Market, picked: Outcome) => select(next, picked.index),
    [select],
  );

  useEffect(() => {
    syncUrl(outcome);
  }, [outcome]);

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

      {/* Правая колонка: на узких экранах уезжает сразу под график.
          Стакан рисует сама панель — так он гарантированно от того же
          исхода, по которому считается котировка. */}
      <aside className="min-w-0 self-start lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-20">
        <TradePanel
          event={event}
          initialSide={initialTradeSide(initialSide)}
          selectedMarket={market}
          selectedOutcomeIndex={outcomeIndex}
          onSelect={select}
          showOrderBook
        />
      </aside>

      {/* Низ левой колонки */}
      <div className="min-w-0 space-y-7 lg:col-start-1 lg:row-start-2">
        <OutcomeList
          event={event}
          selected={{ marketId: market.id, outcomeIndex }}
          onSelect={handleListSelect}
        />
        <EventTabs event={event} market={market} />
        <RelatedEvents events={related} />
      </div>
    </div>
  );
}
