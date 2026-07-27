"use client";

import type { MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/empty-state";
import { ProbabilityBar } from "@/components/ui/probability-ring";
import { Sparkline } from "@/components/ui/sparkline";
import { formatCents, formatProbability } from "@/lib/format";
import { cn } from "@/lib/utils";

export type OutcomeSide = "yes" | "no";

/**
 * Чем строка является по смыслу — от этого зависит вся её подача.
 *
 * ranked   — исход взаимоисключающего события: строки сравнимы между собой и
 *            в сумме дают 100%, поэтому у них есть номер и полоса-мера.
 * question — отдельный вопрос из набора независимых ставок: сравнивать не с
 *            чем, рейтинга не существует. Полосы нет (она бы намекала на
 *            сравнение), вместо неё — собственная траектория цены.
 */
export type OutcomeRowVariant = "ranked" | "question";

/** Пары, которые не нужно подписывать: цвет кнопки и так читается однозначно. */
const IMPLICIT_PAIRS = new Set(["yes|no", "up|down", "over|under", "да|нет"]);

export function isImplicitPair(yes: string, no: string): boolean {
  return IMPLICIT_PAIRS.has(`${yes.trim().toLowerCase()}|${no.trim().toLowerCase()}`);
}

export interface OutcomeRowProps {
  /** Название рынка или исхода: «Above $120k», имя кандидата и т. п. */
  label: string;
  /** Цена исхода «за», 0..1 — она же вероятность. */
  price: number;
  /** Цена второго исхода рынка. Дополнение до единицы — только фолбэк. */
  noPrice?: number;
  /** Цвет полосы; по умолчанию акцентный. Число всегда цветом текста. */
  color?: string;
  /** Подписи исходов берём из самого рынка — бывают Over/Under, имена команд. */
  yesLabel?: string;
  noLabel?: string;
  variant?: OutcomeRowVariant;
  /** Номер в рейтинге — только для variant="ranked". */
  rank?: number;
  /** Лидер рейтинга: то же число, но крупнее — карточке нужен один герой. */
  lead?: boolean;
  /**
   * Траектория цены исхода из пакетного запроса сетки. Меньше двух точек —
   * строка выглядит нормально и без неё.
   */
  points?: number[];
  /** Рынок уже определился — вместо кнопок показываем пометку. */
  settled?: boolean;
  /** Без обработчика строка становится «только для чтения». */
  onBuy?: (side: OutcomeSide) => void;
  disabled?: boolean;
  /**
   * Какая сторона сейчас переходит на страницу события — переход по клику не
   * мгновенный (полноценный переход по маршруту), без этого кнопка выглядит
   * так, будто клик не сработал.
   */
  loadingSide?: OutcomeSide | null;
  className?: string;
}

/**
 * Строка исхода в мультирыночной карточке.
 *
 * Две строки вместо одной: сверху смысл (кто/что и вероятность крупной
 * антиквой), снизу мера и цены. Так число не конкурирует с кнопками за
 * внимание, а карточка получает воздух между блоками.
 */
export function OutcomeRow({
  label,
  price,
  noPrice,
  color,
  yesLabel = "Yes",
  noLabel = "No",
  variant = "ranked",
  rank,
  lead = false,
  points,
  settled = false,
  onBuy,
  disabled = false,
  loadingSide = null,
  className,
}: OutcomeRowProps) {
  // Цена второго исхода приходит из самого рынка; дополнение до единицы —
  // фолбэк для рынков, у которых Gamma не отдала второй исход.
  const against = noPrice ?? 1 - price;
  // Имена вроде «Ninjas in Pyjamas» показываем строкой выше кнопок: на самих
  // кнопках всегда цена, иначе в одной карточке соседствуют «Yes» и «97¢».
  const named = !isImplicitPair(yesLabel, noLabel);
  const ranked = variant === "ranked";

  const handle = (side: OutcomeSide) => (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onBuy?.(side);
  };

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-2.5">
        {ranked && rank != null && (
          <span
            className="tnum w-3.5 shrink-0 text-[11px] leading-none text-faint"
            aria-hidden
          >
            {rank}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium leading-snug text-text">
            {label}
          </p>
          {named && (
            <p
              className="mt-0.5 truncate text-[11px] leading-tight text-faint"
              title={`${yesLabel} · ${noLabel}`}
            >
              <span className="text-yes">{yesLabel}</span>
              <span aria-hidden> · </span>
              <span className="text-no">{noLabel}</span>
            </p>
          )}
        </div>

        {/* Траектория лидера идёт вплотную к его числу: рейтинг без истории
            не говорит, кто поднимается, а кто сдаёт. Место под неё держим
            всегда — ряды приезжают позже разметки, и иначе название рынка
            дёргалось бы при их появлении. */}
        {ranked && lead && (
          <Sparkline points={points ?? []} width={52} height={18} />
        )}

        <span
          className={cn(
            "display tnum shrink-0 leading-none text-text",
            lead ? "text-[26px]" : "text-[20px]",
          )}
        >
          {formatProbability(price)}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        {ranked ? (
          <ProbabilityBar
            probability={price}
            color={color}
            className="min-w-0 flex-1"
          />
        ) : (
          <Sparkline points={points ?? []} width={72} height={22} dot />
        )}

        {settled && <Badge className="ml-auto shrink-0 text-faint">Решён</Badge>}

        {!settled && onBuy && (
          <div className="relative z-10 ml-auto flex shrink-0 items-center gap-1.5">
            <Button
              variant="yes"
              size="xs"
              disabled={disabled || loadingSide === "yes"}
              onClick={handle("yes")}
              title={`${yesLabel} · ${formatCents(price, 0)}`}
              aria-label={`${yesLabel} по ${formatCents(price, 0)}`}
              className="tnum h-8 min-w-[48px] px-2 text-[11.5px]"
            >
              {loadingSide === "yes" ? (
                <Spinner className="size-3" />
              ) : (
                formatCents(price, 0)
              )}
            </Button>
            <Button
              variant="no"
              size="xs"
              disabled={disabled || loadingSide === "no"}
              onClick={handle("no")}
              title={`${noLabel} · ${formatCents(against, 0)}`}
              aria-label={`${noLabel} по ${formatCents(against, 0)}`}
              className="tnum h-8 min-w-[48px] px-2 text-[11.5px]"
            >
              {loadingSide === "no" ? (
                <Spinner className="size-3" />
              ) : (
                formatCents(against, 0)
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
