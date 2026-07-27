"use client";

import Link from "next/link";

import { outcomeToneByLabel } from "@/components/trade/outcome-selector";
import { MarketImage } from "@/components/ui/market-image";
import { ProbabilityBar } from "@/components/ui/probability-ring";
import { formatProbability, formatVolume } from "@/lib/format";
import type { MarketEvent } from "@/lib/types";
import { eventHref } from "@/lib/utils";

/**
 * Лента похожих событий. Плашка намеренно проще карточки на главной: здесь она
 * вспомогательная и не должна перетягивать внимание с графика — из карточки
 * остались только название, одно число и мера под ним.
 */
function RelatedCard({ event }: { event: MarketEvent }) {
  const top = event.markets[0];
  const outcome = top?.outcomes[0];
  const price = outcome?.price ?? 0;

  // Подпись к числу: у бинарного события это его исход, иначе — имя верхнего
  // рынка. Верхний рынок «лидер» только у взаимоисключающего события; у набора
  // независимых ставок наверху просто самый ликвидный вопрос.
  const caption = event.isBinary
    ? (outcome?.label ?? "Yes")
    : (top?.groupTitle ??
      top?.question ??
      (event.exclusive ? "Лидер" : "Ставка события"));

  // Цвет меры: у бинарного события он кодирует сторону исхода, у набора
  // рынков сторон нет — там нейтральный акцент.
  const color = event.isBinary
    ? outcomeToneByLabel(outcome?.label ?? "Yes", 0) === "no"
      ? "var(--no)"
      : "var(--yes)"
    : "var(--accent)";

  return (
    <Link
      href={eventHref(event.slug)}
      className="card card-interactive flex w-[232px] shrink-0 snap-start flex-col p-4"
    >
      <div className="flex items-start gap-2.5">
        <MarketImage
          src={event.icon ?? event.image}
          alt=""
          size={28}
          className="rounded-[9px]"
        />
        <span className="line-clamp-3 min-w-0 flex-1 text-[12.5px] font-medium leading-[1.35] text-text">
          {event.title}
        </span>
      </div>

      <div className="mt-5">
        <p
          className="truncate text-[10.5px] font-medium uppercase leading-none tracking-[0.08em] text-faint"
          title={caption}
        >
          {caption}
        </p>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="display tnum text-[26px] leading-none text-text">
            {formatProbability(price)}
          </span>
          <span className="tnum text-[11px] leading-none text-faint">
            {formatVolume(event.volume)}
          </span>
        </div>
        <ProbabilityBar probability={price} color={color} className="mt-3" />
      </div>
    </Link>
  );
}

export function RelatedEvents({ events }: { events: MarketEvent[] }) {
  if (!events.length) return null;

  return (
    <section>
      <h2 className="display mb-3 text-[20px] leading-tight text-text">
        Похожие события
      </h2>

      <div className="no-scrollbar -mx-1 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-1 pb-1">
        {events.map((event) => (
          <RelatedCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}
