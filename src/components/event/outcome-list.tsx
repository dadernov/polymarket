"use client";

import { Button } from "@/components/ui/button";
import { MarketImage } from "@/components/ui/market-image";
import { ProbabilityBar } from "@/components/ui/probability-ring";
import { ChangeBadge } from "@/components/ui/badge";
import { formatProbability, formatVolume } from "@/lib/format";
import type { Market, MarketEvent, Outcome } from "@/lib/types";
import { cn, outcomeColor } from "@/lib/utils";

export interface OutcomeSelection {
  marketId: string;
  outcomeIndex: number;
}

interface OutcomeListProps {
  event: MarketEvent;
  selected: OutcomeSelection;
  onSelect: (market: Market, outcome: Outcome) => void;
}

function isSelected(selected: OutcomeSelection, market: Market, index: number): boolean {
  return selected.marketId === market.id && selected.outcomeIndex === index;
}

/* ------------------------------------------------------------------ */
/* Событие из одного рынка: компактные строки по исходам               */
/* ------------------------------------------------------------------ */

function BinaryOutcomes({ event, selected, onSelect }: OutcomeListProps) {
  const market = event.markets[0];
  if (!market) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      {market.outcomes.map((outcome) => {
        const active = isSelected(selected, market, outcome.index);
        const color = outcomeColor(outcome.label, outcome.index);
        return (
          <button
            key={outcome.index}
            type="button"
            onClick={() => onSelect(market, outcome)}
            aria-pressed={active}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors",
              "border-b border-border last:border-b-0",
              active ? "bg-accent-soft" : "hover:bg-surface-hover",
            )}
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text">
                {outcome.label}
              </span>
              <span className="mt-1.5 block">
                <ProbabilityBar probability={outcome.price} color={color} />
              </span>
            </span>
            <span
              className="tnum w-14 shrink-0 text-right text-lg font-bold"
              style={{ color }}
            >
              {formatProbability(outcome.price)}
            </span>
            {/* Не <button>: вся строка уже кнопка, вложенность недопустима. */}
            <span
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-sm font-semibold",
                "transition-colors",
                outcome.index === 0
                  ? "bg-yes-soft text-yes"
                  : "bg-no-soft text-no",
                active && (outcome.index === 0 ? "bg-yes text-white" : "bg-no text-white"),
              )}
            >
              Купить
            </span>
          </button>
        );
      })}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Мультирынок: таблица исходов                                        */
/* ------------------------------------------------------------------ */

function MarketRow({
  market,
  selected,
  onSelect,
}: {
  market: Market;
  selected: OutcomeSelection;
  onSelect: (market: Market, outcome: Outcome) => void;
}) {
  const yes = market.outcomes[0];
  const no = market.outcomes[1];
  const active = selected.marketId === market.id;
  const color = outcomeColor(yes?.label ?? "Yes", 0);

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-border px-3 py-2.5 transition-colors last:border-b-0",
        active ? "bg-accent-soft" : "hover:bg-surface-hover",
      )}
    >
      <MarketImage src={market.icon ?? market.image} alt="" size={32} />

      <button
        type="button"
        onClick={() => yes && onSelect(market, yes)}
        className="min-w-0 flex-1 cursor-pointer text-left"
      >
        <span className="line-clamp-2 text-sm font-medium text-text">
          {market.groupTitle ?? market.question}
        </span>
        <span className="tnum mt-0.5 block text-[11px] text-faint">
          {formatVolume(market.volume)} объём
        </span>
      </button>

      <div className="hidden w-14 shrink-0 justify-end sm:flex">
        <ChangeBadge change={market.oneDayPriceChange} />
      </div>

      <div className="w-16 shrink-0">
        <span className="tnum block text-right text-base font-bold" style={{ color }}>
          {formatProbability(yes?.price ?? 0)}
        </span>
        <ProbabilityBar
          probability={yes?.price ?? 0}
          color={color}
          className="mt-1.5"
        />
      </div>

      <div className="flex shrink-0 gap-1.5">
        <Button
          variant="yes"
          size="sm"
          className={cn(
            "w-16",
            isSelected(selected, market, 0) && "bg-yes text-white",
          )}
          onClick={() => yes && onSelect(market, yes)}
          disabled={!yes}
        >
          Yes
        </Button>
        <Button
          variant="no"
          size="sm"
          className={cn("w-16", isSelected(selected, market, 1) && "bg-no text-white")}
          onClick={() => no && onSelect(market, no)}
          disabled={!no}
        >
          No
        </Button>
      </div>
    </div>
  );
}

export function OutcomeList(props: OutcomeListProps) {
  const { event } = props;

  if (!event.markets.length) return null;
  if (event.isBinary || event.markets.length === 1) {
    return <BinaryOutcomes {...props} />;
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border bg-bg-subtle px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
        <span className="w-8 shrink-0" />
        <span className="min-w-0 flex-1">Исход</span>
        <span className="hidden w-14 shrink-0 text-right sm:block">24ч</span>
        <span className="w-16 shrink-0 text-right">Шанс</span>
        <span className="w-[136px] shrink-0" />
      </div>

      <div className="thin-scrollbar max-h-[520px] overflow-y-auto">
        {event.markets.map((market) => (
          <MarketRow
            key={market.id}
            market={market}
            selected={props.selected}
            onSelect={props.onSelect}
          />
        ))}
      </div>
    </section>
  );
}
