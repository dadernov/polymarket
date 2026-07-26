"use client";

import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { ProbabilityBar } from "@/components/ui/probability-ring";
import { formatCents, formatProbability } from "@/lib/format";
import { cn } from "@/lib/utils";

export type OutcomeSide = "yes" | "no";

const LABEL = "block max-w-[52px] truncate";

/**
 * Подпись кнопки. Исходы бывают длинными («Ninjas in Pyjamas») — в узкой
 * карточке такая кнопка съедает название рынка, поэтому длинные заменяем
 * ценой в центах: цвет уже говорит, какая это сторона, а полное имя — в title.
 */
function buttonLabel(label: string, price: number): string {
  return label.length <= 5 ? label : formatCents(price, 0);
}

export interface OutcomeRowProps {
  /** Название исхода: «Above $120k», имя кандидата и т. п. */
  label: string;
  /** Цена исхода «за», 0..1 — она же вероятность. */
  price: number;
  /** Цена противоположного исхода. Из-за спреда это не всегда `1 - price`. */
  noPrice?: number;
  /** Цвет полосы и процента; по умолчанию акцентный. */
  color?: string;
  /** Подписи кнопок берём из самого рынка — бывают Over/Under, Up/Down. */
  yesLabel?: string;
  noLabel?: string;
  /** Без обработчика строка становится «только для чтения». */
  onBuy?: (side: OutcomeSide) => void;
  disabled?: boolean;
  className?: string;
}

/** Строка исхода в мультирыночной карточке: название, полоса, две кнопки. */
export function OutcomeRow({
  label,
  price,
  noPrice,
  color,
  yesLabel = "Yes",
  noLabel = "No",
  onBuy,
  disabled = false,
  className,
}: OutcomeRowProps) {
  const against = noPrice ?? 1 - price;

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
        <ProbabilityBar probability={price} color={color} className="mt-1.5" />
      </div>

      {onBuy && (
        <div className="relative z-10 flex shrink-0 items-center gap-1">
          <Button
            variant="yes"
            size="xs"
            disabled={disabled}
            onClick={handle("yes")}
            title={`${yesLabel} · ${formatCents(price, 0)}`}
            className="h-7 px-2 text-[11px]"
          >
            <span className={LABEL}>{buttonLabel(yesLabel, price)}</span>
          </Button>
          <Button
            variant="no"
            size="xs"
            disabled={disabled}
            onClick={handle("no")}
            title={`${noLabel} · ${formatCents(against, 0)}`}
            className="h-7 px-2 text-[11px]"
          >
            <span className={LABEL}>{buttonLabel(noLabel, against)}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
