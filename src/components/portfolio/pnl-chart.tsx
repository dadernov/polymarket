"use client";

import { useMemo } from "react";
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
import { formatDate, formatDateTime, formatSignedMoney } from "@/lib/format";
import type { Fill } from "@/lib/store";
import { cn } from "@/lib/utils";

interface PnlPoint {
  /** Unix-время в миллисекундах. */
  t: number;
  /** Накопленный реализованный P&L на этот момент. */
  pnl: number;
}

function toneClass(value: number): string {
  if (value > 0) return "text-yes";
  if (value < 0) return "text-no";
  return "text-text";
}

function PnlTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as PnlPoint | undefined;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 shadow-pop">
      <p className="text-[11px] text-muted">{formatDateTime(point.t)}</p>
      <p className={cn("tnum text-sm font-semibold", toneClass(point.pnl))}>
        {formatSignedMoney(point.pnl)}
      </p>
    </div>
  );
}

function Shell({
  children,
  total,
  range,
}: {
  children: React.ReactNode;
  total?: number;
  range?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">Кривая реализованного P&L</p>
          {range && <p className="mt-0.5 text-[11px] text-faint">{range}</p>}
        </div>
        {total != null && (
          <p className={cn("tnum text-lg font-semibold", toneClass(total))}>
            {formatSignedMoney(total)}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

export function PnlChart({ fills }: { fills: Fill[] }) {
  const points = useMemo<PnlPoint[]>(() => {
    // Стор хранит сделки от новых к старым — для графика нужен обратный порядок.
    const chronological = [...fills].sort((a, b) => a.timestamp - b.timestamp);
    const series: PnlPoint[] = [];
    for (const fill of chronological) {
      const previous = series.length > 0 ? series[series.length - 1].pnl : 0;
      series.push({ t: fill.timestamp, pnl: previous + fill.realizedPnl });
    }
    return series;
  }, [fills]);

  if (points.length < 2) {
    return (
      <Shell>
        <div className="flex h-[132px] items-center justify-center rounded-lg border border-dashed border-border px-6 text-center">
          <p className="max-w-xs text-xs leading-relaxed text-muted">
            Совершите пару сделок — здесь появится накопленный результат по закрытым
            позициям.
          </p>
        </div>
      </Shell>
    );
  }

  const total = points[points.length - 1]?.pnl ?? 0;
  const color = total < 0 ? "var(--no)" : "var(--yes)";
  const range = `${formatDate(new Date(points[0].t).toISOString())} — ${formatDate(
    new Date(points[points.length - 1].t).toISOString(),
  )}`;

  return (
    <Shell total={total} range={range}>
      <div className="h-[132px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="pnl-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
            <YAxis domain={["auto", "auto"]} hide />
            <ReferenceLine y={0} stroke="var(--border-strong)" strokeDasharray="3 3" />
            <Tooltip
              content={PnlTooltip}
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="pnl"
              stroke={color}
              strokeWidth={2}
              fill="url(#pnl-area)"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: color }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Shell>
  );
}
