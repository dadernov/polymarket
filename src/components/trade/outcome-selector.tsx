"use client";

/**
 * Выбор того, что именно торгуем.
 *
 * Бинарный рынок — две крупные кнопки: название капителью, цена антиквой,
 * выбранная сторона залита цветом. Рынок с длинным списком исходов — компактные
 * строки, событие из нескольких рынков — ещё и выпадающий список сверху.
 *
 * Компонент полностью управляемый: пара «рынок + индекс исхода» приходит
 * сверху и возвращается одним колбэком. Своего состояния выбора здесь нет,
 * поэтому разъехаться с панелью сделки и стаканом он не может.
 */

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
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

/** Больше этого числа исходов кнопками не показать — переходим на строки. */
const MAX_BUTTONS = 2;

/**
 * Выбранная сторона залита цветом. Текст белый только в светлой теме: в тёмной
 * изумруд и роза сами по себе светлые, и белые буквы на них не читаются —
 * там подпись берёт цвет фона страницы.
 */
const TONE_ACTIVE: Record<OutcomeTone, string> = {
  yes: "border-yes bg-yes text-white dark:text-bg",
  no: "border-no bg-no text-white dark:text-bg",
};

const TONE_IDLE: Record<OutcomeTone, string> = {
  yes: "border-yes/20 bg-yes-soft text-yes hover:border-yes/45",
  no: "border-no/20 bg-no-soft text-no hover:border-no/45",
};

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
  /** Подпись капителью над выбором. */
  label?: string;
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
  label,
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
  const asButtons = visible.length <= MAX_BUTTONS;

  return (
    <div className="space-y-2">
      {label && (
        <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
          {label}
        </p>
      )}

      {picker && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 rounded-[12px] border border-border",
              "bg-surface px-2.5 py-2 text-left transition-colors hover:border-border-strong",
            )}
          >
            <MarketImage
              src={market.icon ?? market.image}
              alt=""
              size={26}
              className="rounded-[8px]"
            />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">
              {marketTitle(market)}
            </span>
            {!isMarketTradable(market, eventClosed) && <Badge tone="neutral">Закрыт</Badge>}
            <span className="display tnum text-[15px] text-text">
              {formatProbability(selected?.price)}
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-faint transition-transform",
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
                  "thin-scrollbar animate-rise absolute inset-x-0 top-full z-40 mt-1.5",
                  "max-h-72 overflow-y-auto rounded-[14px] border border-border",
                  "bg-surface-raised p-1.5 shadow-pop",
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
                        "flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left",
                        "transition-colors hover:bg-surface-hover",
                        active && "bg-surface-hover",
                      )}
                    >
                      <MarketImage
                        src={item.icon ?? item.image}
                        alt=""
                        size={20}
                        className="rounded-[6px]"
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                        {marketTitle(item)}
                      </span>
                      <span className="tnum text-[11.5px] font-medium text-muted">
                        {sellMode && held > 0
                          ? `${formatCompact(held)} акц.`
                          : formatProbability(item.outcomes[0]?.price)}
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

      {visible.length === 0 ? (
        <p className="rounded-[12px] border border-border bg-bg-subtle px-3 py-2.5 text-[11.5px] text-muted">
          По этому рынку нет позиции — продавать нечего.
        </p>
      ) : asButtons ? (
        <div className={cn("grid gap-2", visible.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {visible.map((outcome) => {
            const active = outcome.index === outcomeIndex;
            const tone = outcomeTone(outcome);
            const held = heldOf(outcome);
            const off = disabled || !outcome.tokenId;
            return (
              <button
                key={outcome.tokenId ?? `${outcome.label}-${outcome.index}`}
                type="button"
                disabled={off}
                aria-pressed={active}
                onClick={() => onSelect(market, outcome.index)}
                className={cn(
                  "flex cursor-pointer flex-col items-start gap-1 rounded-[14px] border px-3 py-2.5",
                  "transition-colors disabled:pointer-events-none disabled:opacity-45",
                  active ? TONE_ACTIVE[tone] : TONE_IDLE[tone],
                )}
              >
                <span
                  className={cn(
                    "max-w-full truncate text-[10.5px] font-medium uppercase tracking-[0.08em]",
                    active ? "opacity-80" : "opacity-90",
                  )}
                >
                  {outcome.label}
                </span>
                {/* В продаже на кнопке размер позиции, а не цена: без единицы
                    «121.36» читалось бы как цена исхода. */}
                <span className="flex items-baseline gap-1">
                  <span className="display tnum text-[22px] leading-none">
                    {sellMode ? formatCompact(held) : formatCents(outcome.price, 0)}
                  </span>
                  {sellMode && (
                    <span className="text-[10.5px] font-medium opacity-70">акц.</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1">
          {visible.map((outcome) => {
            const active = outcome.index === outcomeIndex;
            const tone = outcomeTone(outcome);
            const held = heldOf(outcome);
            const off = disabled || !outcome.tokenId;
            return (
              <button
                key={outcome.tokenId ?? `${outcome.label}-${outcome.index}`}
                type="button"
                disabled={off}
                aria-pressed={active}
                onClick={() => onSelect(market, outcome.index)}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between gap-3 rounded-[12px] border px-3 py-2",
                  "transition-colors disabled:pointer-events-none disabled:opacity-45",
                  active
                    ? TONE_ACTIVE[tone]
                    : "border-border bg-surface text-text hover:border-border-strong",
                )}
              >
                <span className="min-w-0 truncate text-[13px] font-medium">{outcome.label}</span>
                <span className="display tnum shrink-0 text-[16px] leading-none">
                  {sellMode ? `${formatCompact(held)} акц.` : formatCents(outcome.price, 0)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
