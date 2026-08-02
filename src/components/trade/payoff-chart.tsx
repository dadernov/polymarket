"use client";

/**
 * График выплаты плечевой позиции: сколько будет P&L, если цена исхода
 * окажется равна X. Ничего не считает сам — форму кривой целиком задаёт
 * `pnlAt` из quoteLeverage, поэтому график и цифры в панели не разъедутся.
 *
 * Сетка идёт по тикам: в их модели цена ходит целыми центами, промежуточных
 * значений не существует, и узлы кривой должны лежать там же. Между тиками
 * P&L линеен, поэтому прямые отрезки — не упрощение, а точная форма.
 *
 * Заливка режется по нулю: выше — изумруд, ниже — роза. Точку разреза задаёт
 * градиент, а не два отдельных ряда, иначе на изломе появляется щель.
 * Линии сетки и рамки — токен `grid`, они должны быть слабее любой подписи.
 */

import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";

import { formatCents, formatMoney, formatSignedMoney } from "@/lib/format";
import type { LeverageSide } from "@/lib/pricing/leverage";
import { TICK_SIZE } from "@/lib/pricing/ticks";
import { cn } from "@/lib/utils";

/** Шаг сетки по цене — один тик ($0.01). */
const STEP = TICK_SIZE;

interface PayoffPoint {
  price: number;
  pnl: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function safe(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Сетка цен плюс точные узлы входа и нокаута — на них кривая ломается. */
function buildPoints(
  pnlAt: (price: number) => number,
  extras: number[],
): PayoffPoint[] {
  const prices = new Set<number>();
  for (let p = 0; p <= 1 + 1e-9; p += STEP) {
    prices.add(Number(p.toFixed(4)));
  }
  for (const extra of extras) {
    if (extra > 0 && extra < 1) {
      // Узел плюс точка вплотную слева: излом ложится ровно на нокаут,
      // а не на ближайшую точку сетки.
      prices.add(Number(Math.max(0, extra - 1e-4).toFixed(4)));
      prices.add(Number(extra.toFixed(4)));
    }
  }

  return [...prices]
    .sort((a, b) => a - b)
    .map((price) => ({ price, pnl: safe(pnlAt(price)) }));
}

/** Шаги шкалы долларов, из которых выбираем ближайший к «примерно 4 деления». */
const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2500, 5000, 10_000];

interface Scale {
  lo: number;
  hi: number;
  ticks: number[];
}

/**
 * Круглая шкала: подписи вида −$200 · $0 · $200 вместо машинных «$637».
 * Ноль в сетке есть всегда — от него отсчитывается прибыль и убыток.
 */
function niceScale(min: number, max: number): Scale {
  const low = Math.min(0, min);
  const high = Math.max(0, max);
  const span = high - low || 1;

  const rough = span / 4;
  const step = NICE_STEPS.find((s) => s >= rough) ?? Math.ceil(rough / 10_000) * 10_000;

  const first = Math.floor(low / step) * step;
  const last = Math.ceil(high / step) * step;

  const ticks: number[] = [];
  for (let value = first; value <= last + step * 0.001; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }

  // Линия не должна лежать ровно на рамке — раздвигаем края там, где упёрлись.
  return {
    lo: first === low ? first - step * 0.2 : first,
    hi: last === high ? last + step * 0.2 : last,
    ticks,
  };
}

function PayoffTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as PayoffPoint | undefined;
  if (!point) return null;

  return (
    <div className="rounded-[12px] border border-border bg-surface-raised px-3 py-2 shadow-pop">
      <p className="tnum text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
        Цена {formatCents(point.price)}
      </p>
      <p
        className={cn(
          "display tnum mt-1 text-[19px] leading-none",
          point.pnl > 0 && "text-yes",
          point.pnl < 0 && "text-no",
          point.pnl === 0 && "text-text",
        )}
      >
        {formatSignedMoney(point.pnl)}
      </p>
    </div>
  );
}

export interface PayoffChartProps {
  side: LeverageSide;
  /** Цена входа 0..1 — тонкая вертикаль для ориентира. */
  entryPrice: number;
  /**
   * Цена, на которой маржа исчерпана. Если нокаут лёг на границу диапазона
   * (0 или 100 тиков), коснуться его цена не может — вертикали на графике нет.
   */
  knockoutPrice: number;
  /**
   * Цена, на которой позиция отбивает уплаченный вперёд тариф. Ноль кривой
   * лежит именно здесь, а не на цене входа. null — если считать не от чего.
   */
  breakEvenPrice?: number | null;
  /** P&L позиции при заданной цене исхода (обычно `quote.pnlAt`). */
  pnlAt: (price: number) => number;
  height?: number;
  className?: string;
}

export function PayoffChart({
  side,
  entryPrice,
  knockoutPrice,
  breakEvenPrice = null,
  pnlAt,
  height = 168,
  className,
}: PayoffChartProps) {
  const entry = clamp01(entryPrice);
  const knockout = safe(knockoutPrice);
  const knockoutVisible = knockout > 0 && knockout < 1;
  const breakEven = breakEvenPrice == null ? null : safe(breakEvenPrice);
  const breakEvenVisible = breakEven != null && breakEven > 0 && breakEven < 1;

  const points = useMemo(
    () => buildPoints(pnlAt, [entry, knockout, breakEven ?? 0]),
    [pnlAt, entry, knockout, breakEven],
  );

  const gradientId = useId();
  const strokeId = useId();

  const { lo, hi, ticks } = useMemo(() => {
    let min = 0;
    let max = 0;
    for (const point of points) {
      if (point.pnl < min) min = point.pnl;
      if (point.pnl > max) max = point.pnl;
    }
    return niceScale(min, max);
  }, [points]);

  // Точка разреза градиента — там, где на нарисованной шкале лежит ноль.
  const span = hi - lo;
  const split = span > 0 ? Math.min(1, Math.max(0, hi / span)) : 1;

  return (
    <div className={cn("space-y-2", className)}>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 14, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor="var(--yes)" stopOpacity={0.3} />
                <stop offset={split} stopColor="var(--yes)" stopOpacity={0.03} />
                <stop offset={split} stopColor="var(--no)" stopOpacity={0.03} />
                <stop offset={1} stopColor="var(--no)" stopOpacity={0.3} />
              </linearGradient>
              <linearGradient id={strokeId} x1="0" y1="0" x2="0" y2="1">
                <stop offset={split} stopColor="var(--yes)" />
                <stop offset={split} stopColor="var(--no)" />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="price"
              type="number"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(value: number) => formatCents(value, 0)}
              tick={{ fill: "var(--faint)", fontSize: 9.5 }}
              tickLine={false}
              axisLine={{ stroke: "var(--grid)" }}
              interval="preserveStartEnd"
              height={18}
            />
            <YAxis
              domain={[lo, hi]}
              ticks={ticks}
              width={46}
              tickFormatter={(value: number) => formatMoney(value, 0)}
              tick={{ fill: "var(--faint)", fontSize: 9.5 }}
              tickLine={false}
              axisLine={false}
            />

            {/* Ноль — смысловая ось, она чуть заметнее сетки. */}
            <ReferenceLine y={0} stroke="var(--border-strong)" strokeWidth={1} />
            <ReferenceLine
              x={entry}
              stroke="var(--border-strong)"
              strokeDasharray="2 4"
              strokeWidth={1}
            />
            {breakEvenVisible && (
              <ReferenceLine x={breakEven} stroke="var(--accent)" strokeDasharray="1 3" />
            )}
            {knockoutVisible && (
              <ReferenceLine
                x={knockout}
                stroke="var(--no)"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{
                  value: "Нокаут",
                  position: "top",
                  fill: "var(--no)",
                  fontSize: 9.5,
                }}
              />
            )}

            <Tooltip
              content={PayoffTooltip}
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            />

            <Area
              type="linear"
              dataKey="pnl"
              baseValue={0}
              stroke={`url(#${strokeId})`}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: "var(--text)" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] font-medium uppercase tracking-[0.06em] text-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-4 border-t border-dashed border-border-strong" />
          Вход <span className="tnum text-muted">{formatCents(entry)}</span>
        </span>
        {knockoutVisible ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-px w-4 border-t border-dashed border-no" />
            Нокаут <span className="tnum text-no">{formatCents(knockout)}</span>
          </span>
        ) : (
          <span>Нокаут недостижим</span>
        )}
        {breakEvenVisible && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-px w-4 border-t border-dotted border-accent" />
            Безубыток <span className="tnum text-accent">{formatCents(breakEven)}</span>
          </span>
        )}
        <span>{side === "LONG" ? "Прибыль при росте" : "Прибыль при падении"}</span>
      </div>
    </div>
  );
}
