"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { MarketImage } from "@/components/ui/market-image";
import { Sparkline } from "@/components/ui/sparkline";
import { useEdgeFade } from "@/components/ui/use-edge-fade";
import { formatPointChange, formatProbability } from "@/lib/format";
import type { SparklineMap } from "@/lib/types";
import type { Mover } from "./movers";
import { cn, eventHref } from "@/lib/utils";

export interface MoversRailProps {
  movers: Mover[];
  /** Ряды цен по tokenId из пакетного запроса страницы. */
  series: SparklineMap;
  className?: string;
}

/**
 * Лента суточных движений.
 *
 * Список рынков отвечает на вопрос «что торгуется», но не отвечает на вопрос
 * «где рынок передумал» — а именно это и стоит смотреть первым. Поэтому
 * главный объект плашки не вероятность, а дельта: крупная антиква со знаком,
 * рост и падение разными цветами, траектория того же цвета рядом.
 */
export function MoversRail({ movers, series, className }: MoversRailProps) {
  const { ref, style, onScroll } = useEdgeFade<HTMLDivElement>();

  if (!movers.length) return null;

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      style={style}
      className={cn(
        // Отрицательный отступ гасит внутренний: плашки едут от края полосы
        // контента, а мягкие края маски не съедают первую рамку.
        "no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1",
        className,
      )}
    >
      {movers.map((mover) => {
        const { event } = mover;
        const up = mover.change > 0;
        const points = (mover.tokenId ? series[mover.tokenId] : undefined) ?? [];
        const tone = up ? "text-yes" : "text-no";
        const Arrow = up ? ArrowUpRight : ArrowDownRight;

        return (
          <Link
            key={event.id}
            href={eventHref(event.slug)}
            className="card card-interactive flex w-[238px] shrink-0 snap-start flex-col gap-4 p-4"
          >
            <div className="flex items-start gap-2.5">
              <MarketImage
                src={event.icon ?? event.image}
                alt=""
                size={26}
                className="mt-px rounded-[8px]"
              />
              <p className="line-clamp-2 text-[12.5px] font-medium leading-snug text-text">
                {event.title}
              </p>
            </div>

            <div className="mt-auto flex items-end justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full",
                      up ? "bg-yes-soft text-yes" : "bg-no-soft text-no",
                    )}
                    aria-hidden
                  >
                    <Arrow className="size-3.5" />
                  </span>
                  <span className={cn("display tnum text-[26px] leading-none", tone)}>
                    {formatPointChange(mover.change)}
                  </span>
                </div>
                <p className="mt-2 text-[10px] font-medium uppercase leading-none tracking-[0.12em] text-faint">
                  п.п. за сутки
                </p>
              </div>

              <Sparkline
                points={points}
                width={78}
                height={36}
                color={up ? "var(--yes)" : "var(--no)"}
                dot
              />
            </div>

            <p className="tnum truncate border-t border-border pt-2.5 text-[11.5px] leading-none text-muted">
              Сейчас {formatProbability(mover.price)}
              {mover.label && <span className="text-faint"> · {mover.label}</span>}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
