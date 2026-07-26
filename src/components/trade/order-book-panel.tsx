"use client";

/**
 * Живой стакан CLOB по одному токену: asks сверху вниз до лучшей цены,
 * строка мида со спредом, ниже bids. Глубина показана фоновой заливкой,
 * ширина которой пропорциональна накопленному объёму уровня.
 */

import { Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState, Spinner } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api, queryKeys, REFRESH } from "@/lib/api";
import { formatCents, formatCompact } from "@/lib/format";
import type { BookLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Сколько уровней показываем свёрнутыми и развёрнутыми. */
const COLLAPSED_ROWS = 8;
const EXPANDED_ROWS = 15;

export interface OrderBookPanelProps {
  tokenId: string;
  tickSize?: number;
  outcomeLabel?: string;
  /** Клик по строке отдаёт цену наружу. По умолчанию строки некликабельны. */
  onSelectPrice?: (price: number) => void;
}

function BookRow({
  level,
  side,
  maxTotal,
  digits,
  onSelectPrice,
}: {
  level: BookLevel;
  side: "ask" | "bid";
  maxTotal: number;
  digits: number;
  onSelectPrice?: (price: number) => void;
}) {
  const isAsk = side === "ask";
  const width = Math.min(100, Math.max(1.5, (level.total / maxTotal) * 100));
  const soft = isAsk ? "var(--no-soft)" : "var(--yes-soft)";

  return (
    <button
      type="button"
      disabled={!onSelectPrice}
      onClick={() => onSelectPrice?.(level.price)}
      title={onSelectPrice ? "Подставить цену в заявку" : undefined}
      className={cn(
        "relative block w-full cursor-pointer px-3 py-1 text-left",
        "transition-colors enabled:hover:bg-surface-hover disabled:cursor-default",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-px right-0 rounded-l-sm"
        style={{
          width: `${width}%`,
          backgroundImage: `linear-gradient(to left, ${soft}, transparent)`,
        }}
      />
      <span className="relative grid grid-cols-3 items-center gap-2 text-xs">
        <span className={cn("tnum font-semibold", isAsk ? "text-no" : "text-yes")}>
          {formatCents(level.price, digits)}
        </span>
        <span className="tnum text-right text-text">{formatCompact(level.size)}</span>
        <span className="tnum text-right text-faint">{formatCompact(level.total)}</span>
      </span>
    </button>
  );
}

function RowsSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-1.5 px-3 py-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

export function OrderBookPanel({
  tokenId,
  tickSize = 0.01,
  outcomeLabel,
  onSelectPrice,
}: OrderBookPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? EXPANDED_ROWS : COLLAPSED_ROWS;
  const token = tokenId || "";

  const { data, isPending, isError, isFetching } = useQuery({
    queryKey: queryKeys.book(token),
    queryFn: ({ signal }) => api.book(token, signal),
    enabled: token.length > 0,
    refetchInterval: REFRESH.book,
  });

  // Мелкий тик — показываем десятые доли цента, иначе целые.
  const digits = tickSize <= 0.005 ? 1 : 0;

  const view = useMemo(() => {
    const asks = (data?.asks ?? []).slice(0, rows);
    const bids = (data?.bids ?? []).slice(0, rows);
    const maxTotal = Math.max(
      1e-6,
      ...asks.map((level) => level.total),
      ...bids.map((level) => level.total),
    );
    const hasMore =
      (data?.asks.length ?? 0) > COLLAPSED_ROWS || (data?.bids.length ?? 0) > COLLAPSED_ROWS;
    return { asks, bids, maxTotal, hasMore };
  }, [data, rows]);

  const header = (
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="text-sm font-semibold text-text">Стакан</h3>
        {outcomeLabel && <Badge tone="neutral">{outcomeLabel}</Badge>}
      </div>
      {isFetching && <Spinner className="size-3.5" />}
    </div>
  );

  const shell = (children: ReactNode) => (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      {header}
      {children}
    </div>
  );

  if (!token) {
    return shell(
      <EmptyState
        icon={<Layers />}
        title="Исход не выбран"
        description="Выберите исход, чтобы увидеть заявки."
        className="py-10"
      />,
    );
  }

  if (isPending) return shell(<RowsSkeleton count={COLLAPSED_ROWS} />);

  if (isError || !data) {
    return shell(
      <EmptyState
        icon={<Layers />}
        title="Стакан не загрузился"
        description="Данные CLOB временно недоступны."
        className="py-10"
      />,
    );
  }

  if (view.asks.length === 0 && view.bids.length === 0) {
    return shell(
      <EmptyState
        icon={<Layers />}
        title="Стакан пуст"
        description="По этому исходу сейчас нет активных заявок."
        className="py-10"
      />,
    );
  }

  const spread = data.spread;
  const midpoint = data.midpoint;

  return shell(
    <div>
      <div className="grid grid-cols-3 gap-2 px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-faint">
        <span>Цена</span>
        <span className="text-right">Размер</span>
        <span className="text-right">Итого</span>
      </div>

      <div className="flex flex-col-reverse">
        {view.asks.map((level) => (
          <BookRow
            key={`ask-${level.price}`}
            level={level}
            side="ask"
            maxTotal={view.maxTotal}
            digits={digits}
            onSelectPrice={onSelectPrice}
          />
        ))}
      </div>

      <div className="my-1 flex items-baseline justify-between gap-2 border-y border-border bg-bg-subtle px-3 py-2">
        <span className="tnum text-base font-semibold text-text">
          {midpoint != null ? formatCents(midpoint, 1) : "—"}
        </span>
        <span className="text-[11px] text-muted">
          спред{" "}
          <span className="tnum font-semibold text-text">
            {spread != null ? formatCents(spread, 1) : "—"}
          </span>
        </span>
      </div>

      <div>
        {view.bids.map((level) => (
          <BookRow
            key={`bid-${level.price}`}
            level={level}
            side="bid"
            maxTotal={view.maxTotal}
            digits={digits}
            onSelectPrice={onSelectPrice}
          />
        ))}
      </div>

      {view.hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className={cn(
            "w-full cursor-pointer border-t border-border py-2 text-xs font-medium",
            "text-muted transition-colors hover:bg-surface-hover hover:text-text",
          )}
        >
          {expanded ? "Свернуть" : `Показать ещё ${EXPANDED_ROWS - COLLAPSED_ROWS}`}
        </button>
      )}
    </div>,
  );
}
