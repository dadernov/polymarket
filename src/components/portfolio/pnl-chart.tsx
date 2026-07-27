"use client";

import Link from "next/link";
import { LineChart as LineChartIcon } from "lucide-react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import {
  formatCompact,
  formatDate,
  formatDateTime,
  formatSignedMoney,
} from "@/lib/format";
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

/** Подпись на оси: `+$1.2k`, `-$340`, `$0`. */
function moneyTick(value: number): string {
  if (Math.abs(value) < 0.005) return "$0";
  return `${value < 0 ? "-" : ""}$${formatCompact(Math.abs(value))}`;
}

function PnlTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as PnlPoint | undefined;
  if (!point) return null;

  return (
    <div className="rounded-xl border border-border bg-surface-raised px-3 py-2 shadow-pop">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
        {formatDateTime(point.t)}
      </p>
      <p className={cn("display tnum mt-1 text-lg leading-none", toneClass(point.pnl))}>
        {formatSignedMoney(point.pnl)}
      </p>
      <p className="mt-1 text-[11px] text-muted">накоплено к этому моменту</p>
    </div>
  );
}

/** Компактный показатель в подвале карточки. */
function Cell({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
        {label}
      </p>
      <p className={cn("display tnum mt-1 text-[15px] leading-none", className)}>
        {value}
      </p>
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
    // Якорь в нуле перед первой сделкой: без него кривая начинается уже с
    // результата первой продажи и подъём от нуля не виден.
    if (series.length > 0) {
      series.unshift({ t: series[0].t - 60_000, pnl: 0 });
    }
    return series;
  }, [fills]);

  const extremes = useMemo(() => {
    let best = 0;
    let worst = 0;
    for (const fill of fills) {
      if (fill.realizedPnl > best) best = fill.realizedPnl;
      if (fill.realizedPnl < worst) worst = fill.realizedPnl;
    }
    return { best, worst };
  }, [fills]);

  const total = points.length > 0 ? points[points.length - 1].pnl : 0;

  const values = points.map((point) => point.pnl);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;

  /**
   * Кривую рисуем только когда ей есть что показать. Две покупки подряд дают
   * формально достаточную серию точек, но все они лежат в нуле: плоская линия
   * на нулевой отметке выглядит как сбой, а не как отсутствие продаж.
   */
  const hasCurve = points.length >= 3 && (min !== 0 || max !== 0);

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">
          Накопленный результат
          {/* Подсказка внутри капительной строки: регистр и трекинг сбрасываем,
              иначе объяснение печатается капслоком. */}
          <Hint className="normal-case tracking-normal">
            Считается только по закрытым позициям: пока исход не продан, его
            прибыль остаётся нереализованной и в кривую не попадает.
          </Hint>
        </p>
        <p
          className={cn(
            "display tnum mt-2 text-[30px] leading-none sm:text-[34px]",
            toneClass(total),
          )}
        >
          {formatSignedMoney(total)}
        </p>
      </div>

      {/* Диапазон дат имеет смысл только у нарисованной кривой: на одной
          сделке он выродился бы в «дата — та же дата». */}
      {hasCurve && (
        <p className="tnum text-[11.5px] text-faint">
          {formatDate(new Date(points[0].t).toISOString())} —{" "}
          {formatDate(new Date(points[points.length - 1].t).toISOString())}
        </p>
      )}
    </div>
  );

  if (!hasCurve) {
    return (
      <section className="card p-5 sm:p-6">
        {header}
        <div className="mt-5 flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-border px-6 py-8 text-center">
          <LineChartIcon className="size-7 text-faint" aria-hidden />
          <p className="text-sm font-semibold text-text">
            {points.length === 0
              ? "Кривая появится после первых сделок"
              : "Кривая появится после первой продажи"}
          </p>
          <p className="max-w-md text-[12.5px] leading-relaxed text-muted">
            Здесь копится результат по закрытым позициям: каждая продажа
            добавляет к кривой свою прибыль или убыток.
          </p>
          <Button asChild size="sm" variant="secondary" className="mt-2">
            <Link href="/">Выбрать рынок</Link>
          </Button>
        </div>
      </section>
    );
  }

  const color = total < 0 ? "var(--no)" : "var(--yes)";

  /**
   * Ноль обязан попадать в область: на него опирается заливка и на нём стоит
   * опорная линия. Со стороны, где данных нет, границу и держим на нуле, а с
   * другой отдаём recharts — тот подбирает круглые подписи сам.
   */
  const yDomain: [number | "auto", number | "auto"] = [
    min < 0 ? "auto" : 0,
    max > 0 ? "auto" : 0,
  ];

  // Двухдневная история, подписанная только датами, дала бы «Jul 26» четыре
  // раза подряд — на коротком отрезке подписываем время.
  const spanMs = points[points.length - 1].t - points[0].t;
  const tickTime = spanMs < 4 * 86_400_000;

  const axis = {
    stroke: "var(--faint)",
    fontSize: 10.5,
    tickLine: false as const,
    axisLine: false as const,
  };

  return (
    <section className="card p-5 sm:p-6">
      {header}

      {/* Линовка под графиком отделяет полотно от сводки, не добавляя рамок. */}
      <div className="rule mt-5 h-[236px] w-full pb-4 sm:h-[276px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="pnl-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              minTickGap={64}
              tickMargin={8}
              tickFormatter={(value: number) =>
                tickTime ? formatDateTime(value) : formatDate(new Date(value).toISOString())
              }
              {...axis}
            />
            <YAxis
              domain={yDomain}
              width={56}
              tickMargin={4}
              tickFormatter={moneyTick}
              {...axis}
            />
            <ReferenceLine y={0} stroke="var(--border-strong)" strokeDasharray="4 4" />
            <Tooltip
              content={PnlTooltip}
              cursor={{
                stroke: "var(--border-strong)",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
              wrapperStyle={{ outline: "none" }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="pnl"
              stroke={color}
              strokeWidth={2}
              baseValue={0}
              fill="url(#pnl-area)"
              dot={false}
              activeDot={{ r: 3.5, strokeWidth: 2, stroke: "var(--surface)", fill: color }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-x-5 sm:[&>*+*]:border-l sm:[&>*+*]:border-border sm:[&>*+*]:pl-5">
        <Cell label="Сделок" value={String(fills.length)} className="text-text" />
        <Cell
          label="Лучшая продажа"
          value={formatSignedMoney(extremes.best)}
          className={toneClass(extremes.best)}
        />
        <Cell
          label="Худшая продажа"
          value={formatSignedMoney(extremes.worst)}
          className={toneClass(extremes.worst)}
        />
      </div>
    </section>
  );
}
