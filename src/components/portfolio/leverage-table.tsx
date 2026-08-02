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
import { Hint } from "@/components/ui/hint";
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
  leveragePositionTariff,
  useLeverage,
  useLeverageHydrated,
  type LeveragePosition,
} from "@/lib/store/leverage";
import type { MarketEvent } from "@/lib/types";
import { cn, eventHref } from "@/lib/utils";

/** Стабильная пустышка: до гидратации показывать сохранённое нельзя. */
const NO_POSITIONS: LeveragePosition[] = [];

/** Ближе этого расстояния до нокаута строку подсвечиваем (в долях цены). */
const DANGER_POINTS = 0.02;
const WARN_POINTS = 0.05;

const TARIFF_HINT =
  "Разовый тариф, уплаченный при открытии: стоимость капитала пула, гэп-премия за риск прыжка цены через нокаут и комиссия платформы. Он уже списан со счёта и учтён в P&L.";

/** Шкала полосы риска: на этом расстоянии от нокаута полоса пуста. */
const RISK_SPAN = 0.1;

/** Капительная шапка столбца — общий вид всех таблиц портфеля. */
const TH =
  "px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint whitespace-nowrap";

const MESSAGES: Record<string, string> = {
  "Position not found": "Позиция не найдена",
  "Invalid price": "Некорректная цена",
};

function formatLeverage(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}x`;
}

/**
 * Расстояние до нокаута — в тиках: цена в плечевой модели ходит целыми
 * центами, и «20 тиков» — это ровно то, что считает движок.
 */
function formatTicks(distance: number): string {
  if (!Number.isFinite(distance)) return "—";
  const n = Math.round(Math.abs(distance) * 100);
  const tail = n % 10;
  const teen = n % 100;
  const word =
    tail === 1 && teen !== 11
      ? "тик"
      : tail >= 2 && tail <= 4 && (teen < 12 || teen > 14)
        ? "тика"
        : "тиков";
  return `${n} ${word}`;
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
      <MarketImage src={position.icon} alt="" size={36} className="rounded-xl" />
      <div className="min-w-0">
        <Link
          href={eventHref(position.eventSlug)}
          className="line-clamp-1 text-[13.5px] font-medium text-text transition-colors hover:text-accent"
        >
          {position.eventTitle || position.marketQuestion}
        </Link>
        <div className="mt-1.5 flex items-center gap-1.5">
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

/**
 * Полоса близости к нокауту: полная — цена вплотную к сгоранию.
 * Число рядом точнее, но полоса читается одним взглядом по всей таблице.
 */
function RiskBar({ distance }: { distance: number }) {
  const risk = Math.min(1, Math.max(0, 1 - Math.abs(distance) / RISK_SPAN));
  return (
    <div className="ml-auto mt-1.5 h-[3px] w-16 overflow-hidden rounded-full bg-grid">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300",
          risk >= 0.8 ? "bg-no" : risk >= 0.5 ? "bg-warn" : "bg-border-strong",
        )}
        style={{ width: `${Math.max(4, risk * 100)}%` }}
      />
    </div>
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
      <div className="card overflow-hidden">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-border p-4 last:border-0"
          >
            <Skeleton className="size-9 rounded-xl" />
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
      <div className="card">
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
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl bg-no-soft px-3.5 py-2.5 text-xs text-no" role="alert">
          {error}
        </p>
      )}

      {live.length > 0 && (
        <div className="card overflow-hidden">
          {/* Пояснение к нокауту живёт над таблицей, а не в её шапке:
              горизонтальная прокрутка обрезала бы всплывающую подсказку. */}
          <header className="rule flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
              Открытые позиции
              <span className="tnum ml-1.5 text-muted">{live.length}</span>
            </p>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-faint">
              <span className="flex items-center gap-1.5">
                Убыток ограничен маржой
                <Hint side="bottom">
                  Нокаут — цена, на которой позиция гаснет, а маржа списывается
                  полностью. Возврат цены обратно её уже не восстанавливает.
                </Hint>
              </span>
              <span className="flex items-center gap-1.5">
                Тариф уплачен вперёд
                <Hint side="bottom">{TARIFF_HINT}</Hint>
              </span>
            </span>
          </header>

          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[1160px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={cn(TH, "text-left")}>Рынок</th>
                  <th className={cn(TH, "text-left")}>Сторона</th>
                  <th className={cn(TH, "text-right")}>Плечо</th>
                  <th className={cn(TH, "text-right")}>Вход</th>
                  <th className={cn(TH, "text-right")}>Сейчас</th>
                  <th className={cn(TH, "text-right")}>Нокаут</th>
                  <th className={cn(TH, "text-right")}>До нокаута</th>
                  <th className={cn(TH, "text-right")}>Маржа</th>
                  <th className={cn(TH, "text-right")}>Тариф</th>
                  <th className={cn(TH, "text-right")}>P&L</th>
                  <th className={cn(TH, "text-right")} aria-label="Действие" />
                </tr>
              </thead>

              <tbody>
                {live.map((position) => {
                  const price = priceOf(position);
                  const pnl = leveragePositionPnl(position, price);
                  const pct = leveragePositionReturnPct(position, price);
                  const distance = leverageDistanceToKnockout(position, price);
                  const tariff = leveragePositionTariff(position);
                  const reachable =
                    position.knockoutPrice > 0 && position.knockoutPrice < 1;

                  return (
                    <tr
                      key={position.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-surface-hover"
                    >
                      <td className="px-4 py-3.5">
                        <MarketCell position={position} />
                      </td>
                      <td className="px-4 py-3.5">
                        <SideCell side={position.side} />
                      </td>
                      <td className="tnum px-4 py-3.5 text-right font-medium text-text">
                        {formatLeverage(position.leverage)}
                      </td>
                      <td className="tnum px-4 py-3.5 text-right text-muted">
                        {formatCents(position.entryPrice)}
                      </td>
                      <td className="tnum px-4 py-3.5 text-right font-medium text-text">
                        {formatCents(price)}
                      </td>
                      <td className="tnum px-4 py-3.5 text-right font-medium text-no">
                        {reachable ? formatCents(position.knockoutPrice) : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div
                          className={cn(
                            "tnum",
                            !reachable && "text-faint",
                            reachable && distance <= DANGER_POINTS && "font-semibold text-no",
                            reachable &&
                              distance > DANGER_POINTS &&
                              distance <= WARN_POINTS &&
                              "text-warn",
                            reachable && distance > WARN_POINTS && "text-muted",
                          )}
                        >
                          {reachable ? formatTicks(distance) : "недостижим"}
                        </div>
                        {reachable && <RiskBar distance={distance} />}
                      </td>
                      <td className="tnum px-4 py-3.5 text-right text-muted">
                        {formatMoney(position.margin)}
                      </td>
                      <td className="tnum px-4 py-3.5 text-right text-muted">
                        {tariff > 0 ? formatMoney(tariff) : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className={cn("tnum font-semibold", pnlTone(pnl))}>
                          {formatSignedMoney(pnl)}
                        </div>
                        <div className={cn("tnum text-[11px]", pnlTone(pnl))}>
                          {formatPercent(pct)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
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
        <div className="card overflow-hidden">
          <header className="rule flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
              Сгоревшие позиции
              <span className="tnum ml-1.5 text-muted">{burned.length}</span>
            </p>
            <p className="text-[11px] text-faint">
              Маржа и тариф списаны полностью — возврат цены их не восстанавливает
            </p>
          </header>

          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <tbody>
                {burned.map((position) => (
                  <tr
                    key={position.id}
                    className="border-b border-border opacity-55 transition-opacity last:border-0 hover:opacity-100"
                  >
                    <td className="px-4 py-3.5">
                      <MarketCell position={position} />
                    </td>
                    <td className="px-4 py-3.5">
                      <SideCell side={position.side} />
                    </td>
                    <td className="tnum px-4 py-3.5 text-right text-muted">
                      {formatLeverage(position.leverage)}
                    </td>
                    <td className="tnum px-4 py-3.5 text-right text-muted">
                      {formatCents(position.entryPrice)} → {formatCents(position.knockoutPrice)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Badge tone="no">Сгорела</Badge>
                      <div className="tnum mt-1.5 text-[11px] text-faint">
                        {position.knockedOutAt ? formatDateTime(position.knockedOutAt) : "—"}
                      </div>
                    </td>
                    <td className="tnum px-4 py-3.5 text-right font-semibold text-no">
                      {formatSignedMoney(
                        -(position.margin + leveragePositionTariff(position)),
                      )}
                      {leveragePositionTariff(position) > 0 && (
                        <div className="text-[11px] font-normal text-faint">
                          в т.ч. тариф {formatMoney(leveragePositionTariff(position))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
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
