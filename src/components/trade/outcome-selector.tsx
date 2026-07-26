"use client";

/**
 * Выбор того, что именно покупаем: у бинарного события — две большие кнопки
 * Yes/No, у события со списком рынков — ещё и компактный дропдаун сверху.
 */

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { MarketImage } from "@/components/ui/market-image";
import { formatCents, formatProbability } from "@/lib/format";
import type { Market, Outcome } from "@/lib/types";
import { cn } from "@/lib/utils";

export type OutcomeTone = "yes" | "no";

/** Семантика исхода: Yes/Up/Over — зелёный, No/Down/Under — красный. */
export function outcomeTone(outcome: Outcome | null | undefined): OutcomeTone {
  if (!outcome) return "yes";
  const label = outcome.label.trim().toLowerCase();
  if (label === "no" || label === "down" || label === "under") return "no";
  if (label === "yes" || label === "up" || label === "over") return "yes";
  return outcome.index === 1 ? "no" : "yes";
}

/** Заголовок строки рынка внутри группы. */
function marketTitle(market: Market): string {
  return market.groupTitle?.trim() || market.question;
}

export interface OutcomeSelectorProps {
  markets: Market[];
  market: Market | null;
  /** Индекс исхода в `market.outcomes`. */
  outcomeIndex: number;
  onSelect: (market: Market, outcomeIndex: number) => void;
  /** У бинарного события список рынков не показываем. */
  showMarketPicker?: boolean;
  disabled?: boolean;
}

export function OutcomeSelector({
  markets,
  market,
  outcomeIndex,
  onSelect,
  showMarketPicker = false,
  disabled = false,
}: OutcomeSelectorProps) {
  const [open, setOpen] = useState(false);

  if (!market) return null;

  const picker = showMarketPicker && markets.length > 1;

  return (
    <div className="space-y-2">
      {picker && (
        <div className="relative">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((value) => !value)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-xl border border-border",
              "bg-bg-subtle px-2.5 py-2 text-left transition-colors",
              "hover:border-border-strong disabled:cursor-default disabled:opacity-60",
            )}
          >
            <MarketImage
              src={market.icon ?? market.image}
              alt=""
              size={24}
              className="rounded-md"
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
              {marketTitle(market)}
            </span>
            <span className="tnum text-sm font-semibold text-text">
              {formatProbability(market.outcomes[0]?.price ?? 0)}
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>

          {open && (
            <>
              <button
                type="button"
                aria-label="Закрыть список рынков"
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-30 cursor-default"
              />
              <div
                role="listbox"
                aria-label="Рынки события"
                className={cn(
                  "thin-scrollbar animate-fade-in absolute inset-x-0 top-full z-40 mt-1",
                  "max-h-64 overflow-y-auto rounded-xl border border-border",
                  "bg-surface-raised p-1 shadow-pop",
                )}
              >
                {markets.map((item) => {
                  const active = item.id === market.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onSelect(item, outcomeIndex);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                        "transition-colors hover:bg-surface-hover",
                        active && "bg-surface-hover",
                      )}
                    >
                      <MarketImage
                        src={item.icon ?? item.image}
                        alt=""
                        size={20}
                        className="rounded"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-text">
                        {marketTitle(item)}
                      </span>
                      <span className="tnum text-xs font-semibold text-muted">
                        {formatProbability(item.outcomes[0]?.price ?? 0)}
                      </span>
                      {active && <Check className="size-3.5 shrink-0 text-accent" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {market.outcomes.map((outcome, index) => {
          const active = index === outcomeIndex;
          const tone = outcomeTone(outcome);
          return (
            <Button
              key={outcome.tokenId ?? `${outcome.label}-${index}`}
              type="button"
              size="lg"
              variant={tone}
              disabled={disabled || !outcome.tokenId}
              aria-pressed={active}
              onClick={() => onSelect(market, index)}
              className={cn(
                "h-14 flex-col gap-0.5 rounded-xl px-2",
                active &&
                  (tone === "no"
                    ? "bg-no text-white hover:bg-no-hover"
                    : "bg-yes text-white hover:bg-yes-hover"),
              )}
            >
              <span className="max-w-full truncate text-sm font-semibold">
                {outcome.label}
              </span>
              <span className="tnum text-xs font-medium opacity-85">
                {formatCents(outcome.price, 0)}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
