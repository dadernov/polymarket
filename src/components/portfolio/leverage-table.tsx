"use client";

/**
 * Плечевые позиции в портфеле.
 *
 * Компонент самодостаточен: сам берёт позиции из @/lib/store/leverage, сам
 * подтягивает текущие цены исходов и сам зовёт `markPrices` — иначе сгоревшие
 * позиции некому пометить. Цены тянем через `/api/events/[slug]`, тот же ключ
 * запроса использует страница портфеля, поэтому лишних сетевых вызовов нет.
 */

import { useQueries } from "@tanstack/react-query";
import Link from "next/link";
import { Gauge } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MarketImage } from "@/components/ui/market-image";
import { Skeleton } from "@/components/ui/skeleton";
import { REFRESH, api, queryKeys } from "@/lib/api";
import {
  formatCents,
  formatDateTime,
  formatMoney,
  formatPercent,
  formatSignedMoney,
} from "@/lib/format";
import {
  leverageDistanceToKnockout,
  leveragePositionPnl,
  leveragePositionReturnPct,
  useLeverage,
  useLeverageHydrated,
  type LeveragePosition,
} from "@/lib/store/leverage";
import type { MarketEvent } from "@/lib/types";
import { cn, eventHref } from "@/lib/utils";

/** Стабильная пустышка: до гидратации показывать сохранённое нельзя. */
const NO_POSITIONS: LeveragePosition[] = [];

/** Ближе этого расстояния до нокаута строку подсвечиваем. */
const DANGER_POINTS = 0.02;
const WARN_POINTS = 0.05;

const MESSAGES: Record<string, string> = {
  "Position not found": "Позиция не найдена",
  "Invalid price": "Некорректная цена",
};

function formatLeverage(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}x`;
}

/** Расстояние до нокаута — в процентных пунктах цены. */
function formatPoints(distance: number): string {
  if (!Number.isFinite(distance)) return "—";
  return `${(Math.abs(distance) * 100).toFixed(1)} п.п.`;
}

function pnlTone(pnl: number): string {
  if (pnl > 0) return "text-yes";
  if (pnl < 0) return "text-no";
  return "text-faint";
}

/** Живые цены исходов по всем событиям, где есть плечевые позиции. */
function useLeverageMarks(positions: LeveragePosition[]): Record<string, number> {
  const slugs = useMemo(() => {
    const unique = new Set<string>();
    for (const position of positions) {
      if (position.eventSlug) unique.add(position.eventSlug);
    }
    return [...unique].sort();
  }, [positions]);

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

function MarketCell({ position }: { position: LeveragePosition }) {
  return (
    <div className="flex items-center gap-3">
      <MarketImage src={position.icon} alt="" size={36} />
      <div className="min-w-0">
        <Link
          href={eventHref(position.eventSlug)}
          className="line-clamp-1 text-sm font-medium text-text transition-colors hover:text-accent"
        >
          {position.eventTitle || position.marketQuestion}
        </Link>
        <div className="mt-1 flex items-center gap-1.5">
          <Badge>{position.outcomeLabel}</Badge>
          {position.marketQuestion && position.marketQuestion !== position.eventTitle && (
            <span className="line-clamp-1 text-[11px] text-faint">
              {position.marketQuestion}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SideCell({ side }: { side: LeveragePosition["side"] }) {
  return (
    <Badge tone={side === "LONG" ? "yes" : "no"}>
      {side === "LONG" ? "LONG" : "SHORT"}
    </Badge>
  );
}

export function LeverageTable() {
  const positionsMap = useLeverage((state) => state.positions);
  const closePosition = useLeverage((state) => state.closePosition);
  const markPrices = useLeverage((state) => state.markPrices);
  const hydrated = useLeverageHydrated();

  const [error, setError] = useState<string | null>(null);

  // Новый массив на каждый рендер сломал бы мемоизацию ниже.
  const stored = useMemo(() => Object.values(positionsMap), [positionsMap]);
  const positions = hydrated ? stored : NO_POSITIONS;
  const marks = useLeverageMarks(positions);

  // `markPrices` сам ничего не делает, когда сгорать нечему, и в этом случае
  // не дёргает подписчиков — поэтому вызывать его на каждый рендер безопасно.
  useEffect(() => {
    markPrices(marks);
  }, [marks, markPrices]);

  const { live, burned } = useMemo(() => {
    const openList: LeveragePosition[] = [];
    const burnedList: LeveragePosition[] = [];
    for (const position of positions) {
      if (position.knockedOutAt != null) burnedList.push(position);
      else openList.push(position);
    }
    openList.sort((a, b) => b.openedAt - a.openedAt);
    burnedList.sort((a, b) => (b.knockedOutAt ?? 0) - (a.knockedOutAt ?? 0));
    return { live: openList, burned: burnedList };
  }, [positions]);

  function priceOf(position: LeveragePosition): number {
    const mark = marks[position.tokenId];
    return typeof mark === "number" && Number.isFinite(mark) ? mark : position.entryPrice;
  }

  function handleClose(position: LeveragePosition) {
    const result = closePosition(position.id, priceOf(position));
    setError(result.ok ? null : (MESSAGES[result.error ?? ""] ?? result.error ?? "Не вышло"));
  }

  if (!hydrated) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-border p-3 last:border-0"
          >
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface">
        <EmptyState
          icon={<Gauge />}
          title="Плечевых позиций нет"
          description="Вкладка «Плечо» в панели сделки открывает позицию с нокаут-ценой: прибыль и убыток растут кратно, а риск ограничен внесённой маржой."
          action={
            <Button asChild size="sm">
              <Link href="/">К рынкам</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg bg-no-soft px-3 py-2 text-xs text-no" role="alert">
          {error}
        </p>
      )}

      {live.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[1020px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-medium text-muted">
                  <th className="px-3 py-2.5 text-left font-medium">Рынок</th>
                  <th className="px-3 py-2.5 text-left font-medium">Сторона</th>
                  <th className="px-3 py-2.5 text-right font-medium">Плечо</th>
                  <th className="px-3 py-2.5 text-right font-medium">Вход</th>
                  <th className="px-3 py-2.5 text-right font-medium">Сейчас</th>
                  <th className="px-3 py-2.5 text-right font-medium">Нокаут</th>
                  <th className="px-3 py-2.5 text-right font-medium">До нокаута</th>
                  <th className="px-3 py-2.5 text-right font-medium">Маржа</th>
                  <th className="px-3 py-2.5 text-right font-medium">P&L</th>
                  <th className="px-3 py-2.5 text-right font-medium" aria-label="Действие" />
                </tr>
              </thead>

              <tbody>
                {live.map((position) => {
                  const price = priceOf(position);
                  const pnl = leveragePositionPnl(position, price);
                  const pct = leveragePositionReturnPct(position, price);
                  const distance = leverageDistanceToKnockout(position, price);
                  const reachable =
                    position.knockoutPrice > 0 && position.knockoutPrice < 1;

                  return (
                    <tr
                      key={position.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-surface-hover"
                    >
                      <td className="px-3 py-3">
                        <MarketCell position={position} />
                      </td>
                      <td className="px-3 py-3">
                        <SideCell side={position.side} />
                      </td>
                      <td className="tnum px-3 py-3 text-right font-medium text-text">
                        {formatLeverage(position.leverage)}
                      </td>
                      <td className="tnum px-3 py-3 text-right text-muted">
                        {formatCents(position.entryPrice)}
                      </td>
                      <td className="tnum px-3 py-3 text-right font-medium text-text">
                        {formatCents(price)}
                      </td>
                      <td className="tnum px-3 py-3 text-right font-medium text-no">
                        {reachable ? formatCents(position.knockoutPrice) : "—"}
                      </td>
                      <td
                        className={cn(
                          "tnum px-3 py-3 text-right",
                          !reachable && "text-faint",
                          reachable && distance <= DANGER_POINTS && "font-semibold text-no",
                          reachable &&
                            distance > DANGER_POINTS &&
                            distance <= WARN_POINTS &&
                            "text-[color:var(--warn)]",
                          reachable && distance > WARN_POINTS && "text-muted",
                        )}
                      >
                        {reachable ? formatPoints(distance) : "недостижим"}
                      </td>
                      <td className="tnum px-3 py-3 text-right text-muted">
                        {formatMoney(position.margin)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className={cn("tnum font-semibold", pnlTone(pnl))}>
                          {formatSignedMoney(pnl)}
                        </div>
                        <div className={cn("tnum text-[11px]", pnlTone(pnl))}>
                          {formatPercent(pct)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => handleClose(position)}
                        >
                          Закрыть
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {burned.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <header className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2.5">
            <p className="text-xs font-medium text-muted">
              Сгоревшие позиции
              <span className="tnum ml-1.5 text-faint">{burned.length}</span>
            </p>
            <p className="text-[11px] text-faint">
              Маржа списана полностью — возврат цены их не восстанавливает
            </p>
          </header>

          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <tbody>
                {burned.map((position) => (
                  <tr
                    key={position.id}
                    className="border-b border-border opacity-60 transition-opacity last:border-0 hover:opacity-100"
                  >
                    <td className="px-3 py-3">
                      <MarketCell position={position} />
                    </td>
                    <td className="px-3 py-3">
                      <SideCell side={position.side} />
                    </td>
                    <td className="tnum px-3 py-3 text-right text-muted">
                      {formatLeverage(position.leverage)}
                    </td>
                    <td className="tnum px-3 py-3 text-right text-muted">
                      {formatCents(position.entryPrice)} → {formatCents(position.knockoutPrice)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Badge tone="no">Сгорела</Badge>
                      <div className="tnum mt-1 text-[11px] text-faint">
                        {position.knockedOutAt ? formatDateTime(position.knockedOutAt) : "—"}
                      </div>
                    </td>
                    <td className="tnum px-3 py-3 text-right font-semibold text-no">
                      {formatSignedMoney(-position.margin)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => handleClose(position)}
                      >
                        Убрать
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
