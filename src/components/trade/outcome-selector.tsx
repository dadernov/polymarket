"use client";

/**
 * Выбор того, что именно торгуем: крупные кнопки исходов, а у события со
 * списком рынков — ещё и компактный дропдаун сверху.
 *
 * Компонент полностью управляемый: пара «рынок + индекс исхода» приходит
 * сверху и возвращается одним колбэком. Своего состояния выбора здесь нет,
 * поэтому разъехаться с панелью сделки и стаканом он не может.
 */

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarketImage } from "@/components/ui/market-image";
import { formatCents, formatCompact, formatProbability } from "@/lib/format";
import type { Market, Outcome } from "@/lib/types";
import { cn } from "@/lib/utils";

export type OutcomeTone = "yes" | "no";

/** Семантика по названию исхода: Yes/Up/Over — зелёный, No/Down/Under — красный. */
export function outcomeToneByLabel(label: string, index = 0): OutcomeTone {
  const normalized = label.trim().toLowerCase();
  if (normalized === "no" || normalized === "down" || normalized === "under") return "no";
  if (normalized === "yes" || normalized === "up" || normalized === "over") return "yes";
  return index === 1 ? "no" : "yes";
}

export function outcomeTone(outcome: Outcome | null | undefined): OutcomeTone {
  return outcome ? outcomeToneByLabel(outcome.label, outcome.index) : "yes";
}

/**
 * Единый предикат «на этот рынок можно отправить заявку». Раньше карточка,
 * список исходов и панель проверяли разные наборы флагов и расходились.
 */
export function isMarketTradable(
  market: Market | null | undefined,
  eventClosed = false,
): boolean {
  if (!market) return false;
  return !eventClosed && !market.closed && market.acceptingOrders;
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
  /**
   * Гасит только кнопки исходов. Дропдаун рынков остаётся живым намеренно:
   * иначе с закрытого рынка невозможно переключиться на торгуемый.
   */
  disabled?: boolean;
  /** Режим продажи: показываем лишь исходы, по которым есть позиция. */
  sellMode?: boolean;
  /** tokenId → число акций в позиции. */
  heldByToken?: Record<string, number>;
  eventClosed?: boolean;
}

export function OutcomeSelector({
  markets,
  market,
  outcomeIndex,
  onSelect,
  disabled = false,
  sellMode = false,
  heldByToken,
  eventClosed = false,
}: OutcomeSelectorProps) {
  const [open, setOpen] = useState(false);

  if (!market) return null;

  const heldOf = (outcome: Outcome | undefined): number =>
    outcome?.tokenId ? (heldByToken?.[outcome.tokenId] ?? 0) : 0;

  const marketHeld = (item: Market): number =>
    item.outcomes.reduce((sum, outcome) => sum + heldOf(outcome), 0);

  const picker = markets.length > 1;
  const selected = market.outcomes[outcomeIndex] ?? market.outcomes[0];
  // В продаже нет смысла показывать исходы, которых нет в портфеле.
  const visible = sellMode
    ? market.outcomes.filter((outcome) => heldOf(outcome) > 0)
    : market.outcomes;

  return (
    <div className="space-y-2">
      {picker && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-xl border border-border",
              "bg-bg-subtle px-2.5 py-2 text-left transition-colors hover:border-border-strong",
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
            {!isMarketTradable(market, eventClosed) && (
              <Badge tone="neutral">Закрыт</Badge>
            )}
            <span className="tnum text-sm font-semibold text-text">
              {formatProbability(selected?.price)}
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
                  const held = marketHeld(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        // Индекс исхода к новому рынку не относится — сбрасываем
                        // его здесь же, чтобы «протухшая» сторона не переехала.
                        onSelect(item, 0);
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
                      {sellMode && held > 0 ? (
                        <span className="tnum text-xs font-semibold text-muted">
                          {formatCompact(held)} акц.
                        </span>
                      ) : (
                        <span className="tnum text-xs font-semibold text-muted">
                          {formatProbability(item.outcomes[0]?.price)}
                        </span>
                      )}
                      {active && <Check className="size-3.5 shrink-0 text-accent" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-xl border border-border bg-bg-subtle px-3 py-2.5 text-xs text-muted">
          По этому рынку нет позиции — продавать нечего.
        </p>
      ) : (
        <div
          className={cn(
            "grid gap-2",
            visible.length > 1 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {visible.map((outcome) => {
            const active = outcome.index === outcomeIndex;
            const tone = outcomeTone(outcome);
            const held = heldOf(outcome);
            return (
              <Button
                key={outcome.tokenId ?? `${outcome.label}-${outcome.index}`}
                type="button"
                size="lg"
                variant={tone}
                disabled={disabled || !outcome.tokenId}
                aria-pressed={active}
                onClick={() => onSelect(market, outcome.index)}
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
                  {sellMode ? `${formatCompact(held)} акц.` : formatCents(outcome.price, 0)}
                </span>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
