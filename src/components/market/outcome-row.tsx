"use client";

import type { MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProbabilityBar } from "@/components/ui/probability-ring";
import { formatCents, formatProbability } from "@/lib/format";
import { cn } from "@/lib/utils";

export type OutcomeSide = "yes" | "no";

/** Пары, которые не нужно подписывать: цвет кнопки и так читается однозначно. */
const IMPLICIT_PAIRS = new Set(["yes|no", "up|down", "over|under"]);

function isImplicitPair(yes: string, no: string): boolean {
  return IMPLICIT_PAIRS.has(`${yes.trim().toLowerCase()}|${no.trim().toLowerCase()}`);
}

export interface OutcomeRowProps {
  /** Название рынка или исхода: «Above $120k», имя кандидата и т. п. */
  label: string;
  /** Цена исхода «за», 0..1 — она же вероятность. */
  price: number;
  /** Цена второго исхода рынка. Дополнение до единицы — только фолбэк. */
  noPrice?: number;
  /** Цвет полосы и процента; по умолчанию акцентный. */
  color?: string;
  /** Подписи исходов берём из самого рынка — бывают Over/Under, имена команд. */
  yesLabel?: string;
  noLabel?: string;
  /** Рынок уже определился — вместо кнопок показываем пометку. */
  settled?: boolean;
  /** Без обработчика строка становится «только для чтения». */
  onBuy?: (side: OutcomeSide) => void;
  disabled?: boolean;
  className?: string;
}

/** Строка рынка в мультирыночной карточке: название, полоса, две цены. */
export function OutcomeRow({
  label,
  price,
  noPrice,
  color,
  yesLabel = "Yes",
  noLabel = "No",
  settled = false,
  onBuy,
  disabled = false,
  className,
}: OutcomeRowProps) {
  // Цена второго исхода приходит из самого рынка; дополнение до единицы —
  // фолбэк для рынков, у которых Gamma не отдала второй исход.
  const against = noPrice ?? 1 - price;
  // Имена вроде «Ninjas in Pyjamas» показываем строкой выше кнопок: на самих
  // кнопках всегда цена, иначе в одной карточке соседствуют «Yes» и «97¢».
  const named = !isImplicitPair(yesLabel, noLabel);

  const handle = (side: OutcomeSide) => (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onBuy?.(side);
  };

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium leading-tight text-text">
            {label}
          </span>
          <span
            className="tnum shrink-0 text-[13px] font-semibold leading-tight"
            style={{ color: color ?? "var(--text)" }}
          >
            {formatProbability(price)}
          </span>
        </div>

        {named && (
          <p
            className="mt-1 truncate text-[10.5px] leading-tight text-faint"
            title={`${yesLabel} · ${noLabel}`}
          >
            <span className="text-yes">{yesLabel}</span>
            <span aria-hidden> · </span>
            <span className="text-no">{noLabel}</span>
          </p>
        )}

        <ProbabilityBar probability={price} color={color} className="mt-1.5" />
      </div>

      {settled && (
        <Badge className="shrink-0 text-faint">Решён</Badge>
      )}

      {!settled && onBuy && (
        <div className="relative z-10 flex shrink-0 items-center gap-1">
          <Button
            variant="yes"
            size="xs"
            disabled={disabled}
            onClick={handle("yes")}
            title={`${yesLabel} · ${formatCents(price, 0)}`}
            aria-label={`${yesLabel} по ${formatCents(price, 0)}`}
            className="tnum h-7 px-2 text-[11px]"
          >
            {formatCents(price, 0)}
          </Button>
          <Button
            variant="no"
            size="xs"
            disabled={disabled}
            onClick={handle("no")}
            title={`${noLabel} · ${formatCents(against, 0)}`}
            aria-label={`${noLabel} по ${formatCents(against, 0)}`}
            className="tnum h-7 px-2 text-[11px]"
          >
            {formatCents(against, 0)}
          </Button>
        </div>
      )}
    </div>
  );
}
