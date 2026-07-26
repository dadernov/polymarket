"use client";

import Link from "next/link";

import { MarketImage } from "@/components/ui/market-image";
import { ProbabilityBar } from "@/components/ui/probability-ring";
import { formatProbability, formatVolume } from "@/lib/format";
import type { MarketEvent } from "@/lib/types";
import { eventHref, outcomeColor } from "@/lib/utils";

/**
 * Лента похожих событий. Карточка намеренно проще, чем MarketCard на главной:
 * здесь она вспомогательная и не должна перетягивать внимание с графика.
 */
function RelatedCard({ event }: { event: MarketEvent }) {
  const top = event.markets[0];
  const outcome = top?.outcomes[0];
  const color = outcomeColor(outcome?.label ?? "Yes", 0);

  // Подпись к числу: у бинарного события это его исход, иначе — имя верхнего
  // рынка. Верхний рынок «лидер» только у взаимоисключающего события; у набора
  // независимых ставок наверху просто самый ликвидный вопрос, поэтому слово
  // «Лидер» осталось запасной подписью для первого случая.
  const caption = event.isBinary
    ? (outcome?.label ?? "Yes")
    : (top?.groupTitle ??
      top?.question ??
      (event.exclusive ? "Лидер" : "Ставка события"));

  return (
    <Link
      href={eventHref(event.slug)}
      className="card flex w-[228px] shrink-0 snap-start flex-col gap-2.5 p-3"
    >
      <div className="flex gap-2.5">
        <MarketImage src={event.icon ?? event.image} alt="" size={32} />
        <span className="line-clamp-2 min-w-0 flex-1 text-[13px] font-medium leading-snug text-text">
          {event.title}
        </span>
      </div>

      <div className="mt-auto">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[11px] text-faint" title={caption}>
            {caption}
          </span>
          <span className="tnum text-sm font-bold" style={{ color }}>
            {formatProbability(outcome?.price ?? 0)}
          </span>
        </div>
        <ProbabilityBar
          probability={outcome?.price ?? 0}
          color={color}
          className="mt-1.5"
        />
        <p className="tnum mt-2 text-[11px] text-faint">
          {formatVolume(event.volume)} объём
        </p>
      </div>
    </Link>
  );
}

export function RelatedEvents({ events }: { events: MarketEvent[] }) {
  if (!events.length) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-text">Похожие события</h2>
      <div className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
        {events.map((event) => (
          <RelatedCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}
