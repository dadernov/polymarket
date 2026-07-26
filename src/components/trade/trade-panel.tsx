"use client";

/**
 * Панель сделки. Собирает воедино выбор исхода, размер заявки, живую
 * котировку по стакану и бумажный портфель.
 *
 * Вся математика — в @/lib/pricing (`quote`), деньги — в @/lib/store.
 * Здесь только состояние формы и проверки перед отправкой.
 */

import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AmountInput, type AmountChip } from "./amount-input";
import { OrderBookPanel } from "./order-book-panel";
import { OutcomeSelector, outcomeTone } from "./outcome-selector";
import { QuoteSummary, translateTradeError } from "./quote-summary";
import { ToastViewport, useToast } from "./toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/tabs";
import { api, queryKeys, REFRESH } from "@/lib/api";
import {
  formatCents,
  formatCompact,
  formatMoney,
  formatSignedMoney,
} from "@/lib/format";
import {
  DEFAULT_FEE_BPS,
  quote,
  type Quote,
  type QuoteInput,
  type Side,
} from "@/lib/pricing";
import {
  positionId,
  positionPnl,
  useHydrated,
  usePortfolioStore,
  type TradeArgs,
} from "@/lib/store";
import type { Market, MarketEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIDE_ITEMS: { value: Side; label: string }[] = [
  { value: "BUY", label: "Купить" },
  { value: "SELL", label: "Продать" },
];

/** Допуск в долларах/акциях при сравнении с балансом. */
const EPS = 1e-6;

function toPositive(text: string): number {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Округление вниз до сотых: «Max» не должен превысить баланс или позицию. */
function floor2(value: number): number {
  return Math.floor(Math.max(0, value) * 100) / 100;
}

function toField(value: number): string {
  const floored = floor2(value);
  return floored > 0 ? String(floored) : "";
}

export interface TradePanelProps {
  event: MarketEvent;
  initialTokenId?: string;
  initialSide?: Side;
  /** Управляемый выбор рынка со стороны страницы события. */
  selectedMarket?: Market | null;
  onSelectMarket?: (market: Market) => void;
  /** Показать стакан внутри панели — если страница не рисует свой. */
  showOrderBook?: boolean;
  className?: string;
}

export function TradePanel({
  event,
  initialTokenId,
  initialSide = "BUY",
  selectedMarket,
  onSelectMarket,
  showOrderBook = false,
  className,
}: TradePanelProps) {
  const toast = useToast();

  const markets = useMemo(() => {
    const tradable = event.markets.filter((market) =>
      market.outcomes.some((outcome) => outcome.tokenId),
    );
    return tradable.length > 0 ? tradable : event.markets;
  }, [event.markets]);

  const [side, setSide] = useState<Side>(initialSide);
  const [marketId, setMarketId] = useState<string | null>(
    () =>
      markets.find((market) =>
        market.outcomes.some((outcome) => outcome.tokenId === initialTokenId),
      )?.id ?? null,
  );
  const [outcomeIndex, setOutcomeIndex] = useState(() => {
    for (const market of markets) {
      const index = market.outcomes.findIndex(
        (outcome) => outcome.tokenId === initialTokenId,
      );
      if (index >= 0) return index;
    }
    return 0;
  });
  const [amountText, setAmountText] = useState("");
  const [sharesText, setSharesText] = useState("");
  const [limitPrice, setLimitPrice] = useState<number | null>(null);

  const market = useMemo(
    () => selectedMarket ?? markets.find((item) => item.id === marketId) ?? markets[0] ?? null,
    [selectedMarket, markets, marketId],
  );

  const outcome = market?.outcomes[outcomeIndex] ?? market?.outcomes[0] ?? null;
  const tokenId = outcome?.tokenId ?? null;
  const token = tokenId ?? "";
  const tone = outcomeTone(outcome);

  // Размер и лимит привязаны к конкретному исходу — при смене сбрасываем прямо
  // в рендере (рекомендованная альтернатива эффекту, лишнего кадра не будет).
  const [prevToken, setPrevToken] = useState(token);
  if (prevToken !== token) {
    setPrevToken(token);
    setSharesText("");
    setLimitPrice(null);
  }

  /* ---------------------------- портфель ---------------------------- */

  const hydrated = useHydrated();
  const cash = usePortfolioStore((state) => state.cash);
  const buyAction = usePortfolioStore((state) => state.buy);
  const sellAction = usePortfolioStore((state) => state.sell);
  const position = usePortfolioStore((state) =>
    market && tokenId ? state.positions[positionId(market.conditionId, tokenId)] : undefined,
  );
  const heldShares = hydrated ? (position?.shares ?? 0) : 0;

  /* ----------------------------- стакан ----------------------------- */

  const { data: book, isPending: bookPending } = useQuery({
    queryKey: queryKeys.book(token),
    queryFn: ({ signal }) => api.book(token, signal),
    enabled: token.length > 0,
    refetchInterval: REFRESH.book,
  });

  /* --------------------------- котировка ---------------------------- */

  const amount = toPositive(amountText);
  const sellShares = toPositive(sharesText);
  const sizeEntered = side === "BUY" ? amount > 0 : sellShares > 0;

  const currentQuote = useMemo<Quote | null>(() => {
    if (!book || !sizeEntered) return null;
    const input: QuoteInput = {
      side,
      book,
      tickSize: market?.tickSize ?? 0.01,
      feeBps: DEFAULT_FEE_BPS,
      ...(side === "BUY" ? { amount } : { shares: sellShares }),
      ...(limitPrice != null ? { limitPrice } : {}),
    };
    return quote(input);
  }, [book, sizeEntered, side, market?.tickSize, amount, sellShares, limitPrice]);

  const estimatedPnl =
    side === "SELL" && currentQuote && !currentQuote.error && position
      ? currentQuote.total - currentQuote.shares * position.avgPrice
      : null;

  // Для оценки позиции берём лучший бид: столько дадут за акции прямо сейчас.
  const markPrice = book?.bids[0]?.price ?? outcome?.price ?? 0;
  const unrealized = position ? positionPnl(position, markPrice) : 0;

  const tradingClosed = Boolean(market && (market.closed || !market.acceptingOrders));

  const disabledReason = useMemo(() => {
    if (!market || !tokenId) return "Рынок недоступен";
    if (tradingClosed) return "Торговля закрыта";
    if (!hydrated) return "Загрузка счёта…";
    if (!sizeEntered) return side === "BUY" ? "Введите сумму" : "Введите количество";
    if (bookPending || !book) return "Загрузка стакана…";
    if (currentQuote?.error) return translateTradeError(currentQuote.error);
    if (!currentQuote || currentQuote.shares <= 0) return "Заявку нельзя исполнить";
    if (side === "BUY" && currentQuote.total > cash + EPS) return "Недостаточно средств";
    if (side === "SELL" && sellShares > heldShares + EPS) return "Недостаточно акций";
    return null;
  }, [
    market,
    tokenId,
    tradingClosed,
    hydrated,
    sizeEntered,
    side,
    bookPending,
    book,
    currentQuote,
    cash,
    sellShares,
    heldShares,
  ]);

  /* ---------------------------- действия ---------------------------- */

  function handleSelect(nextMarket: Market, nextOutcomeIndex: number) {
    setMarketId(nextMarket.id);
    setOutcomeIndex(nextOutcomeIndex);
    if (nextMarket.id !== market?.id) onSelectMarket?.(nextMarket);
  }

  function handleSide(nextSide: Side) {
    setSide(nextSide);
    setLimitPrice(null);
  }

  function handleSubmit() {
    if (disabledReason || !market || !outcome || !tokenId || !currentQuote) return;

    const args: TradeArgs = {
      eventSlug: event.slug,
      eventTitle: event.title,
      marketQuestion: market.question,
      marketId: market.id,
      conditionId: market.conditionId,
      tokenId,
      outcomeLabel: outcome.label,
      outcomeIndex: outcome.index,
      icon: market.icon ?? market.image ?? event.icon ?? event.image,
      shares: currentQuote.shares,
      price: currentQuote.avgPrice,
      fee: currentQuote.fee,
    };

    const result = side === "BUY" ? buyAction(args) : sellAction(args);
    if (!result.ok) {
      toast.error("Сделка не прошла", translateTradeError(result.error) ?? undefined);
      return;
    }

    const details = `${formatCompact(currentQuote.shares)} акц. ${outcome.label} по ${formatCents(
      currentQuote.avgPrice,
    )}`;
    if (side === "BUY") {
      toast.success(`Куплено на ${formatMoney(currentQuote.total)}`, details);
      setAmountText("");
    } else {
      toast.success(`Продано на ${formatMoney(currentQuote.total)}`, details);
      setSharesText("");
    }
    setLimitPrice(null);
  }

  const buyChips: AmountChip[] = [
    { label: "+$1", onClick: () => setAmountText(toField(amount + 1)) },
    { label: "+$20", onClick: () => setAmountText(toField(amount + 20)) },
    { label: "+$100", onClick: () => setAmountText(toField(amount + 100)) },
    { label: "Max", onClick: () => setAmountText(toField(cash)), disabled: !hydrated },
  ];

  const sellChips: AmountChip[] = [
    { label: "25%", onClick: () => setSharesText(toField(heldShares * 0.25)) },
    { label: "50%", onClick: () => setSharesText(toField(heldShares * 0.5)) },
    { label: "Max", onClick: () => setSharesText(toField(heldShares)) },
  ].map((chip) => ({ ...chip, disabled: !hydrated || heldShares <= 0 }));

  const headline = market?.groupTitle?.trim() || market?.question || event.title;
  const submitLabel =
    side === "BUY"
      ? `Купить ${outcome?.label ?? ""}`.trim()
      : `Продать ${outcome?.label ?? ""}`.trim();

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <section className="rounded-xl border border-border bg-surface shadow-card">
        <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{headline}</p>
            <p className="text-[11px] text-muted">
              {tradingClosed ? "Торги завершены" : "Бумажная торговля"}
            </p>
          </div>
          <SegmentedControl items={SIDE_ITEMS} value={side} onChange={handleSide} />
        </header>

        <div className="space-y-3 p-3">
          <OutcomeSelector
            markets={markets}
            market={market}
            outcomeIndex={market?.outcomes[outcomeIndex] ? outcomeIndex : 0}
            onSelect={handleSelect}
            showMarketPicker={!event.isBinary}
            disabled={tradingClosed}
          />

          {limitPrice != null && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs text-accent">
              <span>
                Лимитная цена{" "}
                <span className="tnum font-semibold">{formatCents(limitPrice)}</span>
              </span>
              <button
                type="button"
                onClick={() => setLimitPrice(null)}
                aria-label="Сбросить лимитную цену"
                className="cursor-pointer rounded-md p-0.5 transition-opacity hover:opacity-70"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {side === "BUY" ? (
            <AmountInput
              mode="amount"
              label="Сумма"
              value={amountText}
              onChange={setAmountText}
              chips={buyChips}
              disabled={tradingClosed}
              invalid={disabledReason === "Недостаточно средств"}
              hint={hydrated ? `Доступно ${formatMoney(cash)}` : undefined}
            />
          ) : (
            <AmountInput
              mode="shares"
              label="Акций"
              value={sharesText}
              onChange={setSharesText}
              chips={sellChips}
              disabled={tradingClosed}
              invalid={disabledReason === "Недостаточно акций"}
              hint={hydrated ? `В позиции ${formatCompact(heldShares)} акц.` : undefined}
            />
          )}

          <QuoteSummary
            side={side}
            quote={currentQuote}
            loading={sizeEntered && bookPending}
            estimatedPnl={estimatedPnl}
          />

          <Button
            type="button"
            fullWidth
            size="lg"
            variant={tone}
            disabled={Boolean(disabledReason)}
            onClick={handleSubmit}
            className={cn(
              "h-12",
              !disabledReason &&
                (tone === "no"
                  ? "bg-no text-white hover:bg-no-hover"
                  : "bg-yes text-white hover:bg-yes-hover"),
            )}
          >
            {disabledReason ?? submitLabel}
          </Button>

          <div className="space-y-1.5 border-t border-border pt-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">Доступно</span>
              {hydrated ? (
                <span className="tnum font-semibold text-text">{formatMoney(cash)}</span>
              ) : (
                <Skeleton className="h-3.5 w-16" />
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-muted">
                Позиция{outcome ? ` · ${outcome.label}` : ""}
              </span>
              {!hydrated ? (
                <Skeleton className="h-3.5 w-28" />
              ) : position && heldShares > 0 ? (
                <span className="tnum flex items-center gap-1.5 font-medium text-text">
                  <span>{formatCompact(heldShares)} акц.</span>
                  <span className="text-faint">{formatCents(position.avgPrice)}</span>
                  <span
                    className={cn(
                      "font-semibold",
                      unrealized > 0 && "text-yes",
                      unrealized < 0 && "text-no",
                      unrealized === 0 && "text-faint",
                    )}
                  >
                    {formatSignedMoney(unrealized)}
                  </span>
                </span>
              ) : (
                <span className="text-faint">—</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {showOrderBook && tokenId && (
        <OrderBookPanel
          tokenId={tokenId}
          tickSize={market?.tickSize}
          outcomeLabel={outcome?.label}
          onSelectPrice={setLimitPrice}
        />
      )}

      <ToastViewport />
    </div>
  );
}
