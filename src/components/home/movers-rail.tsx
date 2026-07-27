import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { MarketImage } from "@/components/ui/market-image";
import { Sparkline } from "@/components/ui/sparkline";
import { formatPointChange, formatProbability } from "@/lib/format";
import type { MarketEvent, SparklineMap } from "@/lib/types";
import { cn, eventHref } from "@/lib/utils";

/** Сколько плашек держим в ленте: дальше листать перестают. */
const MOVERS_LIMIT = 8;

/** Ниже этого порога «движение» — округление, а не новость. */
const MIN_CHANGE = 0.005;

/** Подписи, которые ничего не добавляют к числу. */
const IMPLICIT_YES = new Set(["yes", "да", "up", "over"]);

export interface Mover {
  event: MarketEvent;
  /** Токен движущегося исхода — для ряда цен. */
  tokenId: string | null;
  /** Текущая вероятность исхода, 0..1. */
  price: number;
  /** Изменение за сутки в долях (0.05 = +5 п.п.). */
  change: number;
  /** Чей это исход, если название что-то говорит: имя кандидата, порог. */
  label: string | null;
}

export interface PickMoversOptions {
  /** Событие, уже показанное крупно: в ленте оно было бы повтором. */
  exclude?: string;
  limit?: number;
  minChange?: number;
}

/**
 * События, у которых вероятность за сутки сдвинулась сильнее всего.
 *
 * Дельта берётся у первого рынка события, и это корректно только там, где
 * рынки взаимоисключающие: у набора независимых ставок «изменения события»
 * не существует — двигаться могут разные вопросы в разные стороны. Такие
 * события в ленту не попадают вовсе, вместо того чтобы попасть с неверным
 * числом.
 */
export function pickMovers(
  events: MarketEvent[],
  options: PickMoversOptions = {},
): Mover[] {
  const { exclude, limit = MOVERS_LIMIT, minChange = MIN_CHANGE } = options;
  const movers: Mover[] = [];

  for (const event of events) {
    if (event.id === exclude || event.closed) continue;
    if (!(event.exclusive || event.markets.length === 1)) continue;

    const market = event.markets[0];
    if (!market || market.closed || !market.acceptingOrders) continue;

    const outcome = market.outcomes[0];
    if (!outcome) continue;
    // Рынок с ценой на границе уже фактически решён — его «движение» ничего
    // не сообщает о будущем.
    if (outcome.price <= 0 || outcome.price >= 1) continue;

    const change = market.oneDayPriceChange;
    if (!Number.isFinite(change) || Math.abs(change) < minChange) continue;

    const named =
      market.groupTitle ??
      (IMPLICIT_YES.has(outcome.label.trim().toLowerCase()) ? null : outcome.label);

    movers.push({
      event,
      tokenId: outcome.tokenId,
      price: outcome.price,
      change,
      label: named,
    });
  }

  movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return movers.slice(0, limit);
}

/** Токены ленты — страница запрашивает ряды цен одним пакетом. */
export function moverTokenIds(movers: Mover[]): string[] {
  const ids: string[] = [];
  for (const mover of movers) if (mover.tokenId) ids.push(mover.tokenId);
  return ids;
}

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
  if (!movers.length) return null;

  return (
    <div
      className={cn(
        // Отрицательный отступ гасит внутренний: плашки едут от края полосы
        // контента, а мягкие края маски не съедают первую рамку.
        "no-scrollbar fade-edges -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1",
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
