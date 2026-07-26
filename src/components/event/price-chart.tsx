"use client";

import { useQueries } from "@tanstack/react-query";
import { format } from "date-fns";
import { LineChart as LineChartIcon } from "lucide-react";
import { useId, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";

import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/tabs";
import { ChangeBadge } from "@/components/ui/badge";
import { REFRESH, api, queryKeys } from "@/lib/api";
import { formatDateTime, formatProbability } from "@/lib/format";
import type { ChartInterval, MarketEvent, PricePoint } from "@/lib/types";
import { cn, outcomeColor, seriesColor } from "@/lib/utils";

const INTERVALS: { value: ChartInterval; label: string }[] = [
  { value: "1h", label: "1H" },
  { value: "6h", label: "6H" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "1m", label: "1M" },
  { value: "max", label: "ALL" },
];

/** Сколько линий рисуем на мультирынке: больше пяти — уже каша. */
const MAX_SERIES = 5;

interface ChartSeries {
  key: string;
  tokenId: string;
  label: string;
  color: string;
  marketId: string;
}

interface ChartRow {
  t: number;
  [key: string]: number | undefined;
}

/* ------------------------------------------------------------------ */
/* Подготовка данных                                                   */
/* ------------------------------------------------------------------ */

function buildSeries(event: MarketEvent, activeMarketId?: string): ChartSeries[] {
  // Один рынок в событии — это всегда «одна линия»: рисуем исход, а не вопрос.
  if (event.markets.length === 1) {
    const market = event.markets[0];
    const outcome = market.outcomes[0];
    if (!outcome?.tokenId) return [];
    return [
      {
        key: "v0",
        tokenId: outcome.tokenId,
        label: outcome.label,
        color: outcomeColor(outcome.label, 0),
        marketId: market.id,
      },
    ];
  }

  const top = event.markets.slice(0, MAX_SERIES);
  // Выбранный исход всегда должен быть виден, даже если он вне топа.
  if (activeMarketId && !top.some((m) => m.id === activeMarketId)) {
    const active = event.markets.find((m) => m.id === activeMarketId);
    if (active) top.splice(Math.max(top.length - 1, 0), 1, active);
  }

  return top
    .map((market, index) => ({
      key: `v${index}`,
      tokenId: market.outcomes[0]?.tokenId ?? "",
      label: market.groupTitle ?? market.question,
      color: seriesColor(index),
      marketId: market.id,
    }))
    .filter((s) => s.tokenId.length > 0);
}

function buildRows(
  series: ChartSeries[],
  datasets: (PricePoint[] | undefined)[],
): ChartRow[] {
  const byTime = new Map<number, ChartRow>();
  series.forEach((s, index) => {
    for (const point of datasets[index] ?? []) {
      const row = byTime.get(point.t) ?? { t: point.t };
      row[s.key] = point.p;
      byTime.set(point.t, row);
    }
  });
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

function edgeValue(rows: ChartRow[], key: string, from: "first" | "last"): number | null {
  const order = from === "last" ? [...rows].reverse() : rows;
  for (const row of order) {
    const value = row[key];
    if (typeof value === "number") return value;
  }
  return null;
}

/** Шаги сетки, из которых выбираем ближайший к «примерно 4 деления». */
const NICE_STEPS = [0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5];

/**
 * Масштаб оси Y по фактическим данным, а не жёсткие 0..100%: иначе линии
 * рынка с вероятностями 5–20% вырождаются в полоску у нижнего края.
 * Диапазон расширяем с запасом и подгоняем под «круглую» сетку.
 */
function computeDomain(
  rows: ChartRow[],
  keys: string[],
): { domain: [number, number]; ticks: number[] } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    for (const key of keys) {
      const value = row[key];
      if (typeof value !== "number") continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1] };
  }

  // Плоская линия: раскрываем окно вокруг значения, чтобы она шла по центру.
  const span = max - min;
  const padding = Math.max(span * 0.18, 0.02);
  let low = Math.max(0, min - padding);
  let high = Math.min(1, max + padding);
  if (high - low < 0.04) {
    const center = (high + low) / 2;
    low = Math.max(0, center - 0.02);
    high = Math.min(1, center + 0.02);
  }

  const step =
    NICE_STEPS.find((candidate) => (high - low) / candidate <= 4.5) ??
    NICE_STEPS[NICE_STEPS.length - 1];

  // Прижимаем границы к сетке, чтобы подписи были круглыми.
  low = Math.max(0, Math.floor(low / step) * step);
  high = Math.min(1, Math.ceil(high / step) * step);

  const ticks: number[] = [];
  for (let value = low; value <= high + step / 2; value += step) {
    ticks.push(Number(Math.min(1, value).toFixed(4)));
  }

  return { domain: [low, high], ticks };
}

function tickLabel(interval: ChartInterval, seconds: number): string {
  const date = new Date(seconds * 1000);
  if (interval === "1h" || interval === "6h" || interval === "1d") {
    return format(date, "HH:mm");
  }
  if (interval === "max") return format(date, "MMM yy");
  return format(date, "d MMM");
}

/* ------------------------------------------------------------------ */
/* Подсказка                                                           */
/* ------------------------------------------------------------------ */

function renderTooltip(
  props: TooltipContentProps,
  series: ChartSeries[],
): React.ReactNode {
  if (!props.active || !props.payload?.length) return null;

  const stamp = Number(props.label);
  const entries = props.payload
    .map((entry) => {
      const meta = series.find((s) => s.key === String(entry.dataKey));
      const value = typeof entry.value === "number" ? entry.value : Number(entry.value);
      return meta && Number.isFinite(value) ? { meta, value } : null;
    })
    .filter((item): item is { meta: ChartSeries; value: number } => item !== null)
    .sort((a, b) => b.value - a.value);

  if (!entries.length) return null;

  return (
    <div className="pointer-events-none min-w-[168px] rounded-xl border border-border bg-surface-raised p-2.5 shadow-pop">
      <p className="tnum text-[11px] font-medium text-faint">
        {Number.isFinite(stamp) ? formatDateTime(stamp) : "—"}
      </p>
      <ul className="mt-1.5 space-y-1">
        {entries.map(({ meta, value }) => (
          <li key={meta.key} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            <span className="min-w-0 flex-1 truncate text-muted">{meta.label}</span>
            <span className="tnum font-semibold text-text">
              {(value * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Компонент                                                           */
/* ------------------------------------------------------------------ */

export function PriceChart({
  event,
  activeMarketId,
}: {
  event: MarketEvent;
  activeMarketId?: string;
}) {
  const [interval, setInterval] = useState<ChartInterval>("1w");
  const [hidden, setHidden] = useState<string[]>([]);
  const rawId = useId();
  const gradientId = `pc-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  const series = buildSeries(event, activeMarketId);

  const results = useQueries({
    queries: series.map((s) => ({
      queryKey: queryKeys.priceHistory(s.tokenId, interval),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.priceHistory(s.tokenId, interval, signal),
      refetchInterval: REFRESH.prices,
      staleTime: REFRESH.prices,
      retry: 1,
    })),
  });

  const rows = buildRows(
    series,
    results.map((r) => r.data),
  );
  const loading = results.some((r) => r.isPending);

  const primary =
    series.find((s) => s.marketId === activeMarketId) ?? series[0] ?? null;
  const last = primary ? edgeValue(rows, primary.key, "last") : null;
  const first = primary ? edgeValue(rows, primary.key, "first") : null;

  // Фолбэк на цену из Gamma: график может не успеть приехать, а число нужно сразу.
  const fallbackPrice =
    event.markets.find((m) => m.id === primary?.marketId)?.outcomes[0]?.price ?? null;
  const current = last ?? fallbackPrice;
  const change = last != null && first != null ? last - first : 0;
  const trendColor = change >= 0 ? "var(--yes)" : "var(--no)";
  // Одна серия — площадь, окрашенная по направлению; несколько — линии по палитре.
  const single = series.length === 1;
  const headlineColor = single ? trendColor : (primary?.color ?? "var(--text)");

  // Масштабируем ось только по тем сериям, что реально видны на полотне.
  const visibleKeys = single
    ? primary
      ? [primary.key]
      : []
    : series.filter((s) => !hidden.includes(s.key)).map((s) => s.key);
  const { domain: yDomain, ticks: yTicks } = computeDomain(rows, visibleKeys);
  // Мелкий шаг сетки требует десятой доли процента, иначе подписи дублируются.
  const fractionalTicks = yTicks.some((tick) => Math.abs(tick * 100 - Math.round(tick * 100)) > 0.01);
  const formatYTick = (value: number) =>
    `${(value * 100).toFixed(fractionalTicks ? 1 : 0)}%`;

  const toggleSeries = (key: string) =>
    setHidden((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const axis = {
    stroke: "var(--faint)",
    fontSize: 11,
    tickLine: false as const,
    axisLine: false as const,
  };

  return (
    <section className="card p-4 hover:border-border hover:bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted">
            {single
              ? `Шанс «${primary?.label ?? "Yes"}»`
              : (primary?.label ?? "Вероятность")}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className="tnum text-3xl font-bold leading-none tracking-tight"
              style={{ color: current == null ? undefined : headlineColor }}
            >
              {current == null ? "—" : formatProbability(current)}
            </span>
            <ChangeBadge change={change} />
          </div>
        </div>

        <SegmentedControl
          items={INTERVALS}
          value={interval}
          onChange={setInterval}
          className="shrink-0"
        />
      </div>

      <div className="mt-4 h-[320px] w-full">
        {loading && rows.length === 0 ? (
          <Skeleton className="size-full rounded-xl" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<LineChartIcon />}
            title="Нет истории цен"
            description="Для этого исхода котировки пока не публиковались — попробуйте другой интервал."
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {single && primary ? (
              <AreaChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={trendColor} stopOpacity={0.34} />
                    <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  minTickGap={48}
                  tickMargin={8}
                  tickFormatter={(value: number) => tickLabel(interval, value)}
                  {...axis}
                />
                <YAxis
                  domain={yDomain}
                  ticks={yTicks}
                  width={44}
                  tickMargin={4}
                  tickFormatter={formatYTick}
                  {...axis}
                />
                <Tooltip
                  cursor={{
                    stroke: "var(--border-strong)",
                    strokeWidth: 1,
                    strokeDasharray: "4 4",
                  }}
                  wrapperStyle={{ outline: "none" }}
                  isAnimationActive={false}
                  content={(props) => renderTooltip(props, series)}
                />
                <Area
                  type="monotone"
                  dataKey={primary.key}
                  stroke={trendColor}
                  strokeWidth={2}
                  // Заливка идёт до низа полотна, а не до нуля вне видимой области.
                  baseValue={yDomain[0]}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 2, stroke: "var(--surface)" }}
                  isAnimationActive={false}
                  connectNulls
                />
              </AreaChart>
            ) : (
              <LineChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  minTickGap={48}
                  tickMargin={8}
                  tickFormatter={(value: number) => tickLabel(interval, value)}
                  {...axis}
                />
                <YAxis
                  domain={yDomain}
                  ticks={yTicks}
                  width={44}
                  tickMargin={4}
                  tickFormatter={formatYTick}
                  {...axis}
                />
                <Tooltip
                  cursor={{
                    stroke: "var(--border-strong)",
                    strokeWidth: 1,
                    strokeDasharray: "4 4",
                  }}
                  wrapperStyle={{ outline: "none" }}
                  isAnimationActive={false}
                  content={(props) => renderTooltip(props, series)}
                />
                {series.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={s.marketId === activeMarketId ? 2.4 : 1.6}
                    dot={false}
                    activeDot={{ r: 3.5, strokeWidth: 2, stroke: "var(--surface)" }}
                    hide={hidden.includes(s.key)}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {!single && series.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {series.map((s) => {
            const off = hidden.includes(s.key);
            const value = edgeValue(rows, s.key, "last");
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleSeries(s.key)}
                aria-pressed={!off}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1",
                  "text-[11px] font-medium transition-colors",
                  off
                    ? "border-border text-faint hover:text-muted"
                    : "border-border-strong text-text hover:bg-surface-hover",
                )}
              >
                <span
                  className="size-2 shrink-0 rounded-full transition-opacity"
                  style={{ backgroundColor: s.color, opacity: off ? 0.3 : 1 }}
                />
                <span className="max-w-[140px] truncate">{s.label}</span>
                {value != null && (
                  <span className="tnum text-faint">{formatProbability(value)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
