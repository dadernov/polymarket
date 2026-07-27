"use client";

/**
 * Живой стакан CLOB по одному токену: аски сверху вниз до лучшей цены,
 * строка мида со спредом, ниже биды. Глубина показана фоновой заливкой,
 * ширина которой пропорциональна накопленному объёму уровня.
 *
 * Тон намеренно тихий: стакан — служебная таблица, он не должен перекрикивать
 * выплату в панели сделки. Отсюда мелкие капительные заголовки столбцов, линии
 * цвета `grid` и мягкие заливки yes/no-soft вместо насыщенных цветов.
 *
 * Панель всегда показывает ИМЕННО выбранный исход: ключ запроса содержит
 * tokenId, а `staleTime: 0` заставляет перезапросить книгу сразу после
 * переключения — из кэша не всплывут цифры минутной давности.
 */

import { Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";

import { outcomeToneByLabel } from "./outcome-selector";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Spinner } from "@/components/ui/empty-state";
import { Hint } from "@/components/ui/hint";
import { Skeleton } from "@/components/ui/skeleton";
import { api, queryKeys, REFRESH } from "@/lib/api";
import { formatCents, formatCompact } from "@/lib/format";
import type { BookLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Сколько уровней показываем свёрнутыми и развёрнутыми. */
const COLLAPSED_ROWS = 8;
const EXPANDED_ROWS = 15;

/**
 * Одна подсказка на всю панель — и та слева. Тултип шириной 224px, поставленный
 * у правого края узкой колонки, вылезал бы за карточку и обрезался.
 */
const BOOK_HINT =
  "Сверху — заявки на продажу (аски), снизу — на покупку (биды). Между ними мид-цена и спред: разрыв между лучшими заявками, он и есть плата за немедленный вход. «Итого» — сколько акций наберётся, если выкупить все уровни до этой строки; та же глубина показана полосой фоном.";

/** Названия, у которых зелёный/красный действительно что-то значат. */
const SEMANTIC_LABELS = new Set(["yes", "no", "up", "down", "over", "under"]);

/** Для команд и имён цвет не кодирует «за/против» — оставляем нейтральный. */
function badgeTone(label: string | undefined): "yes" | "no" | "neutral" {
  const normalized = label?.trim().toLowerCase();
  if (!normalized || !SEMANTIC_LABELS.has(normalized)) return "neutral";
  return outcomeToneByLabel(normalized);
}

export interface OrderBookPanelProps {
  tokenId: string;
  tickSize?: number;
  outcomeLabel?: string;
  /** Вопрос выбранного рынка — чтобы заголовок не отрывался от контекста. */
  marketTitle?: string;
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
        "relative block w-full px-4 py-[3px] text-left transition-colors",
        onSelectPrice ? "cursor-pointer hover:bg-surface-hover" : "cursor-default",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 right-0 rounded-l-[3px]"
        style={{
          width: `${width}%`,
          backgroundImage: `linear-gradient(to left, ${soft}, transparent)`,
        }}
      />
      <span className="relative grid grid-cols-[auto_1fr_1fr] items-baseline gap-2 text-[11.5px]">
        <span className={cn("tnum font-medium", isAsk ? "text-no" : "text-yes")}>
          {formatCents(level.price, digits)}
        </span>
        <span className="tnum text-right text-muted">{formatCompact(level.size)}</span>
        <span className="tnum text-right text-faint">{formatCompact(level.total)}</span>
      </span>
    </button>
  );
}

function RowsSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-2 px-4 py-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-2">
          <Skeleton className="h-2.5 w-10" />
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="h-2.5 w-12" />
        </div>
      ))}
    </div>
  );
}

export function OrderBookPanel({
  tokenId,
  tickSize = 0.01,
  outcomeLabel,
  marketTitle,
  onSelectPrice,
}: OrderBookPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const token = tokenId || "";

  // Смена исхода — это другой стакан: глубину раскрытия не переносим.
  const [prevToken, setPrevToken] = useState(token);
  if (prevToken !== token) {
    setPrevToken(token);
    setExpanded(false);
  }

  const rows = expanded ? EXPANDED_ROWS : COLLAPSED_ROWS;

  const { data, isPending, isError, isFetching } = useQuery({
    queryKey: queryKeys.book(token),
    queryFn: ({ signal }) => api.book(token, signal),
    enabled: token.length > 0,
    refetchInterval: REFRESH.book,
    // Общий staleTime в 20 с показал бы при возврате на исход старую книгу.
    staleTime: 0,
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
    <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
            Стакан заявок
          </h3>
          <Hint side="bottom">{BOOK_HINT}</Hint>
          {outcomeLabel && <Badge tone={badgeTone(outcomeLabel)}>{outcomeLabel}</Badge>}
        </div>
        {marketTitle && (
          <p className="mt-1 truncate text-[12px] text-muted">{marketTitle}</p>
        )}
      </div>
      {isFetching && <Spinner className="mt-0.5 size-3.5 shrink-0" />}
    </div>
  );

  const shell = (children: ReactNode) => (
    <section className="card overflow-hidden">
      {header}
      {children}
    </section>
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
    <div className="py-1">
      <div className="grid grid-cols-[auto_1fr_1fr] gap-2 px-4 pb-1.5 pt-2 text-[9.5px] font-medium uppercase tracking-[0.1em] text-faint">
        <span>Цена</span>
        <span className="text-right">Размер</span>
        <span className="text-right">Итого</span>
      </div>

      {/* Аски идут снизу вверх: лучшая цена продажи прижата к строке мида. */}
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

      <div className="my-1 flex items-baseline justify-between gap-2 border-y border-grid bg-bg-subtle px-4 py-2">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-faint">
            мид
          </span>
          <span className="display tnum text-[20px] leading-none text-text">
            {midpoint != null ? formatCents(midpoint, 1) : "—"}
          </span>
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

      <div className="mt-1 flex items-center justify-between gap-2 border-t border-grid px-4 pt-2">
        <span className="text-[10.5px] text-faint">
          {onSelectPrice ? "Клик по строке — лимитная цена" : "Аски сверху, биды снизу"}
        </span>
        {view.hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className={cn(
              "shrink-0 cursor-pointer rounded-[8px] px-1.5 py-0.5 text-[11px] font-medium",
              "text-muted transition-colors hover:text-accent",
            )}
          >
            {expanded ? "Свернуть" : `Ещё ${EXPANDED_ROWS - COLLAPSED_ROWS}`}
          </button>
        )}
      </div>
    </div>,
  );
}
