"use client";

import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Container } from "@/components/layout/container";
import { HistoryTable } from "@/components/portfolio/history-table";
import { LeverageTable } from "@/components/portfolio/leverage-table";
import { PnlChart } from "@/components/portfolio/pnl-chart";
import { PortfolioSummary } from "@/components/portfolio/portfolio-summary";
import { PositionsTable } from "@/components/portfolio/positions-table";
import { Tabs } from "@/components/ui/tabs";
import { api, queryKeys, REFRESH } from "@/lib/api";
import {
  useHydrated,
  useLeverage,
  useLeverageHydrated,
  usePortfolioStore,
  type Fill,
  type LeveragePosition,
  type Position,
} from "@/lib/store";
import type { MarketEvent } from "@/lib/types";

type Tab = "positions" | "leverage" | "history";

/** Стабильные пустышки: до гидратации нельзя показывать сохранённые данные. */
const NO_POSITIONS: Position[] = [];
const NO_LEVERAGE: LeveragePosition[] = [];
const NO_FILLS: Fill[] = [];

/**
 * Живые котировки для позиций.
 *
 * Берём событие целиком, а не стакан каждого токена: в позициях лежат только
 * tokenId, но у одного события их обычно несколько, поэтому запросов выходит
 * по числу событий, а не токенов (и это уже закэшированный `/api/events/[slug]`,
 * тогда как `/api/book` пришлось бы дёргать на каждый исход отдельно).
 * `outcome.price` — та же середина рынка; если цены нет, вызывающий код
 * откатывается на avgPrice.
 *
 * Ключи запросов те же, что у <LeverageTable/>, — сеть от общего списка слагов
 * не нагружается, зато сводка видит цены и по плечевым позициям.
 */
function useEventMarks(slugs: string[]): Record<string, number> {
  const results = useQueries({
    queries: slugs.map((slug) => ({
      queryKey: queryKeys.event(slug),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.event(slug, signal),
      staleTime: REFRESH.prices,
      refetchInterval: REFRESH.prices,
    })),
  });

  const marks: Record<string, number> = {};
  for (const result of results) {
    const event: MarketEvent | undefined = result.data;
    if (!event) continue;
    for (const market of event.markets) {
      for (const outcome of market.outcomes) {
        if (outcome.tokenId) marks[outcome.tokenId] = outcome.price;
      }
    }
  }
  return marks;
}

export default function PortfolioPage() {
  const positionsMap = usePortfolioStore((s) => s.positions);
  const fills = usePortfolioStore((s) => s.fills);
  const hydrated = useHydrated();

  const leverageMap = useLeverage((s) => s.positions);
  const markPrices = useLeverage((s) => s.markPrices);
  const leverageHydrated = useLeverageHydrated();

  const [tab, setTab] = useState<Tab>("positions");

  // Новый массив на каждый рендер сломал бы getSnapshot стора — мемоизируем.
  const stored = useMemo(() => Object.values(positionsMap), [positionsMap]);
  const storedLeverage = useMemo(() => Object.values(leverageMap), [leverageMap]);
  const positions = hydrated ? stored : NO_POSITIONS;
  const leveragePositions = leverageHydrated ? storedLeverage : NO_LEVERAGE;
  const visibleFills = hydrated ? fills : NO_FILLS;

  const slugs = useMemo(() => {
    const unique = new Set<string>();
    for (const position of positions) {
      if (position.eventSlug) unique.add(position.eventSlug);
    }
    for (const position of leveragePositions) {
      if (position.eventSlug) unique.add(position.eventSlug);
    }
    return [...unique].sort();
  }, [positions, leveragePositions]);

  const marks = useEventMarks(slugs);

  // Сгоревшие позиции нужно помечать и с закрытой вкладкой «Плечо», иначе
  // сводка считает сгоревшую маржу живой. Вызов идемпотентен и без изменений
  // не дёргает подписчиков.
  useEffect(() => {
    markPrices(marks);
  }, [marks, markPrices]);

  return (
    <Container className="py-6 lg:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-text">Портфель</h1>
        <p className="mt-1 text-sm text-muted">
          Бумажный счёт: деньги виртуальные, котировки и переоценка — настоящие.
        </p>
      </header>

      <PortfolioSummary marks={marks} />

      <div className="mt-4">
        <PnlChart fills={visibleFills} />
      </div>

      <div className="mt-6">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "positions", label: "Позиции", count: positions.length },
            { value: "leverage", label: "Плечо", count: leveragePositions.length },
            { value: "history", label: "История", count: visibleFills.length },
          ]}
        />

        <div className="mt-4">
          {tab === "positions" && (
            <PositionsTable positions={positions} marks={marks} loading={!hydrated} />
          )}
          {/* Таблица плеча самодостаточна: свои позиции, цены и гидратацию берёт сама. */}
          {tab === "leverage" && <LeverageTable />}
          {tab === "history" && <HistoryTable fills={visibleFills} loading={!hydrated} />}
        </div>
      </div>
    </Container>
  );
}
