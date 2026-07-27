"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowDown, ArrowUp, Briefcase } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MarketImage } from "@/components/ui/market-image";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import { api, queryKeys } from "@/lib/api";
import {
  formatCents,
  formatCompact,
  formatMoney,
  formatPercent,
  formatSignedMoney,
} from "@/lib/format";
import { positionCost, type Position } from "@/lib/store";
import { cn, eventHref } from "@/lib/utils";

type SortKey = "value" | "pnl";

/** Капительная шапка столбца — общий вид всех таблиц портфеля. */
const TH =
  "px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint whitespace-nowrap";

/** Траектории живут дольше цен: 14 точек за две недели не стареют за минуту. */
const SPARKLINE_STALE = 120_000;

interface Row {
  position: Position;
  price: number;
  value: number;
  pnl: number;
  pct: number;
}

function outcomeTone(label: string): "yes" | "no" | "neutral" {
  const normalized = label.trim().toLowerCase();
  if (normalized === "yes" || normalized === "up" || normalized === "over") return "yes";
  if (normalized === "no" || normalized === "down" || normalized === "under") return "no";
  return "neutral";
}

function pnlTone(pnl: number): string {
  if (pnl > 0) return "text-yes";
  if (pnl < 0) return "text-no";
  return "text-faint";
}

/** Заголовок сортируемой колонки: клик по активной переворачивает порядок. */
function SortHeader({
  label,
  active,
  desc,
  onClick,
}: {
  label: string;
  active: boolean;
  desc: boolean;
  onClick: () => void;
}) {
  const Icon = desc ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 uppercase tracking-[0.08em] transition-colors hover:text-text",
        active && "text-text",
      )}
    >
      {label}
      <Icon className={cn("size-3", active ? "opacity-100" : "opacity-0")} />
    </button>
  );
}

export function PositionsTable({
  positions,
  marks,
  loading = false,
}: {
  positions: Position[];
  marks: Record<string, number>;
  loading?: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [desc, setDesc] = useState(true);

  const tokenIds = useMemo(
    () => positions.map((position) => position.tokenId).filter(Boolean),
    [positions],
  );

  // Траектории берём одним пакетом на всю таблицу: цена без истории не
  // объясняет, откуда позиция пришла к текущей переоценке.
  const { data: series } = useQuery({
    queryKey: queryKeys.sparklines(tokenIds),
    queryFn: ({ signal }) => api.sparklines(tokenIds, signal),
    enabled: tokenIds.length > 0,
    staleTime: SPARKLINE_STALE,
  });

  const rows = useMemo<Row[]>(() => {
    const list = positions.map((position) => {
      const mark = marks[position.tokenId];
      // Нет живой котировки — показываем позицию «в нуле» по себестоимости.
      const price =
        typeof mark === "number" && Number.isFinite(mark) ? mark : position.avgPrice;
      const value = position.shares * price;
      const cost = positionCost(position);
      const pnl = value - cost;
      return { position, price, value, pnl, pct: cost > 0 ? pnl / cost : 0 };
    });

    const dir = desc ? -1 : 1;
    return list.sort((a, b) => (sortKey === "value" ? a.value - b.value : a.pnl - b.pnl) * dir);
  }, [positions, marks, sortKey, desc]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setDesc((v) => !v);
    else {
      setSortKey(key);
      setDesc(true);
    }
  };

  if (loading) {
    return (
      <div className="card overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
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

  if (rows.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<Briefcase />}
          title="Пока нет открытых позиций"
          description="Выберите событие, сделайте прогноз — купленные исходы появятся здесь с живой переоценкой."
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
    <div className="card overflow-hidden">
      <div className="thin-scrollbar overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className={cn(TH, "text-left")}>Рынок</th>
              <th className={cn(TH, "text-right")}>Акции</th>
              <th className={cn(TH, "text-right")}>Средняя</th>
              <th className={cn(TH, "text-right")}>Сейчас</th>
              <th className={cn(TH, "text-left")}>Траектория</th>
              <th className={cn(TH, "text-right")}>
                <SortHeader
                  label="Стоимость"
                  active={sortKey === "value"}
                  desc={desc}
                  onClick={() => toggle("value")}
                />
              </th>
              <th className={cn(TH, "text-right")}>
                <SortHeader
                  label="P&L"
                  active={sortKey === "pnl"}
                  desc={desc}
                  onClick={() => toggle("pnl")}
                />
              </th>
              <th className={cn(TH, "text-right")} aria-label="Действие" />
            </tr>
          </thead>

          <tbody>
            {rows.map(({ position, price, value, pnl, pct }) => {
              const sellHref = `${eventHref(position.eventSlug)}?outcome=${encodeURIComponent(
                position.tokenId,
              )}&side=SELL`;

              return (
                <tr
                  key={position.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-3.5">
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
                          <Badge tone={outcomeTone(position.outcomeLabel)}>
                            {position.outcomeLabel}
                          </Badge>
                          {position.marketQuestion &&
                            position.marketQuestion !== position.eventTitle && (
                              <span className="line-clamp-1 text-[11px] text-faint">
                                {position.marketQuestion}
                              </span>
                            )}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="tnum px-4 py-3.5 text-right text-muted">
                    {formatCompact(position.shares)}
                  </td>
                  <td className="tnum px-4 py-3.5 text-right text-muted">
                    {formatCents(position.avgPrice)}
                  </td>
                  <td className="tnum px-4 py-3.5 text-right font-medium text-text">
                    {formatCents(price)}
                  </td>
                  <td className="px-4 py-3.5">
                    <Sparkline
                      points={series?.[position.tokenId] ?? []}
                      width={84}
                      height={26}
                      dot
                    />
                  </td>
                  <td className="tnum px-4 py-3.5 text-right font-medium text-text">
                    {formatMoney(value)}
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
                    <Button asChild size="xs" variant="outline">
                      <Link href={sellHref}>Продать</Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
