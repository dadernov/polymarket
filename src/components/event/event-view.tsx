"use client";

/**
 * Клиентская оболочка страницы события и единственный владелец выбора
 * «рынок + исход». Шапка, график, объяснение, список исходов, панель сделки и
 * стакан читают одну и ту же пару, поэтому разъехаться им негде.
 *
 * Порядок блоков задан читателем, а не колонками: вопрос → траектория →
 * «что вы покупаете» → форма сделки. На узком экране этот же порядок остаётся
 * порядком в потоке, поэтому новичок видит разбор до того, как дойдёт до кнопки
 * «купить», а сама панель стоит сразу за героем экрана.
 *
 * Выбор дублируется в query-строку (`?outcome=<tokenId>`): по такой ссылке
 * страница открывается на нужном исходе, как и по диплинку с карточки.
 */

import { useCallback, useEffect, useState } from "react";

import { EventHeader } from "@/components/event/event-header";
import { EventTabs } from "@/components/event/event-tabs";
import { MarketExplainer } from "@/components/event/market-explainer";
import { OutcomeList, type OutcomeSelection } from "@/components/event/outcome-list";
import { PriceChart } from "@/components/event/price-chart";
import { RelatedEvents } from "@/components/event/related-events";
import { TradePanel } from "@/components/trade/trade-panel";
import { EmptyState } from "@/components/ui/empty-state";
import type { Side } from "@/lib/pricing";
import type { Market, MarketEvent, Outcome } from "@/lib/types";
import { cn } from "@/lib/utils";

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
      <div className="space-y-6">
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
    <div className="space-y-7 lg:space-y-8">
      <EventHeader event={event} market={market} outcome={outcome} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-7">
        {/* Герой экрана: траектория, а сразу под ней — разбор выбранного
            исхода. На мобильном оба блока стоят до панели сделки. */}
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          <PriceChart event={event} activeMarketId={market.id} />
          {outcome && (
            <MarketExplainer event={event} market={market} outcome={outcome} />
          )}
        </div>

        {/* Стакан рисует сама панель — так он гарантированно от того же
            исхода, по которому считается котировка. */}
        {/* id — цель быстрого перехода из шапки на узком экране. */}
        {/* Прилипшая колонка выше экрана: панель сделки со стаканом не
            помещается в видимую область, и без собственной прокрутки её низ —
            вместе с кнопкой покупки — становится недостижим. Ограничиваем
            высоту окном и прокручиваем внутри; цепочку к странице не рвём,
            чтобы после конца панели колесо продолжало листать страницу. */}
        <aside
          id="trade"
          className={cn(
            "thin-scrollbar min-w-0 self-start scroll-mt-20",
            "lg:col-start-2 lg:row-span-2 lg:row-start-1",
            "lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-1",
          )}
        >
          <TradePanel
            event={event}
            initialSide={initialTradeSide(initialSide)}
            selectedMarket={market}
            selectedOutcomeIndex={outcomeIndex}
            onSelect={select}
            showOrderBook
          />
        </aside>

        <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-2">
          <OutcomeList
            event={event}
            selected={{ marketId: market.id, outcomeIndex }}
            onSelect={handleListSelect}
          />
          <EventTabs event={event} market={market} />
        </div>
      </div>

      <RelatedEvents events={related} />
    </div>
  );
}
