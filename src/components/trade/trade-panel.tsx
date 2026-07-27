"use client";

/**
 * Панель сделки. Держит одну пару «рынок + исход» — свою или пришедшую сверху
 * со страницы события, — размер заявки, зафиксированную котировку по стакану
 * и бумажный портфель.
 *
 * Порядок экрана отвечает порядку мысли: что покупаем → сколько → СКОЛЬКО
 * ПОЛУЧИМ, если угадали → мелким шрифтом чем это обойдётся. Выплата — герой
 * панели, служебные величины (средняя цена, объём, проскальзывание, комиссия)
 * живут вторым планом в <QuoteSummary/>.
 *
 * Ключевое правило: стакан, котировка, кнопка и подпись читают ОДИН и тот же
 * `outcome`. Отдельного «индекса исхода внутри панели» больше нет, поэтому
 * купить не то, что выбрано на странице, невозможно.
 *
 * Вкладка «Плечо» — тот же выбор исхода, но сделку собирает <LeveragePanel/>
 * со своей математикой (@/lib/pricing/leverage) и своим хранилищем позиций.
 * Спотовая ветка от этого не зависит: её состояние живёт рядом и не сбрасывается.
 *
 * Вся математика спота — в @/lib/pricing (`quote`), деньги — в @/lib/store.
 */

import { Lock, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { AmountInput, type AmountChip } from "./amount-input";
import { LeveragePanel } from "./leverage-panel";
import { OrderBookPanel } from "./order-book-panel";
import { isMarketTradable, OutcomeSelector, outcomeTone } from "./outcome-selector";
import {
  QuoteSummary,
  TradeNotice,
  translateTradeError,
  type PriceAlert,
} from "./quote-summary";
import { ToastViewport, useToast } from "./toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat, StatRow } from "@/components/ui/stat";
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
  estimateReturn,
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

/** Спот и плечо — две независимые формы над одним и тем же исходом. */
type Mode = "spot" | "leverage";

const MODE_ITEMS: { value: Mode; label: string }[] = [
  { value: "spot", label: "Спот" },
  { value: "leverage", label: "Плечо" },
];

/** Допуск в долларах/акциях при сравнении с балансом и позицией. */
const EPS = 1e-6;

/** На сколько средняя цена может уйти между показом расчёта и кликом (1 п.п.). */
const MAX_PRICE_DRIFT = 0.01;

/** Ниже/выше этой цены исход считаем фактически определившимся. */
const RESOLVED_EPS = 0.001;

function toPositive(text: string): number {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Округление вниз до сотых: «Max» по деньгам не должен превысить баланс. */
function floor2(value: number): number {
  return Math.floor(Math.max(0, value) * 100) / 100;
}

function toField(value: number): string {
  const floored = floor2(value);
  return floored > 0 ? String(floored) : "";
}

/** Акции даём точнее центов, иначе «Max» оставляет пыль и позиция не закрывается. */
function toSharesField(value: number): string {
  return value > 0 ? String(Number(value.toFixed(6))) : "";
}

interface Selection {
  marketId: string;
  outcomeIndex: number;
}

/** Где в событии лежит токен из диплинка. Чужой токен → первый рынок. */
function locateToken(markets: Market[], tokenId?: string): Selection {
  if (tokenId) {
    for (const market of markets) {
      const outcome = market.outcomes.find((item) => item.tokenId === tokenId);
      if (outcome) return { marketId: market.id, outcomeIndex: outcome.index };
    }
  }
  return { marketId: markets[0]?.id ?? "", outcomeIndex: 0 };
}

export interface TradePanelProps {
  event: MarketEvent;
  /** tokenId из диплинка. Работает, только когда выбор не управляется снаружи. */
  initialTokenId?: string;
  initialSide?: Side;
  /** Управляемый выбор со стороны страницы события. */
  selectedMarket?: Market | null;
  selectedOutcomeIndex?: number;
  /** Панель сообщает наружу обе части выбора сразу — рынок и исход. */
  onSelect?: (market: Market, outcomeIndex: number) => void;
  /** Показать стакан выбранного исхода под панелью. */
  showOrderBook?: boolean;
  className?: string;
}

export function TradePanel({
  event,
  initialTokenId,
  initialSide = "BUY",
  selectedMarket,
  selectedOutcomeIndex,
  onSelect,
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

  const [mode, setMode] = useState<Mode>("spot");
  const [side, setSide] = useState<Side>(initialSide);
  const [inner, setInner] = useState<Selection>(() => locateToken(markets, initialTokenId));
  const leverageMode = mode === "leverage";

  /* --------------------- выбранная пара (одна на всё) --------------------- */

  const market =
    selectedMarket ?? markets.find((item) => item.id === inner.marketId) ?? markets[0] ?? null;
  const desiredIndex = selectedOutcomeIndex ?? inner.outcomeIndex;
  const outcomeIndex = market?.outcomes[desiredIndex] ? desiredIndex : 0;
  const outcome = market?.outcomes[outcomeIndex] ?? null;
  const tokenId = outcome?.tokenId ?? null;
  const token = tokenId ?? "";
  const tone = outcomeTone(outcome);
  const tradable = isMarketTradable(market, event.closed);

  /* ---------------------------- портфель ---------------------------- */

  const hydrated = useHydrated();
  const cash = usePortfolioStore((state) => state.cash);
  const positions = usePortfolioStore((state) => state.positions);
  const buyAction = usePortfolioStore((state) => state.buy);
  const sellAction = usePortfolioStore((state) => state.sell);

  /** tokenId → акции в позиции по всем рынкам события. */
  const heldByToken = useMemo(() => {
    const map: Record<string, number> = {};
    if (!hydrated) return map;
    for (const item of markets) {
      for (const candidate of item.outcomes) {
        if (!candidate.tokenId) continue;
        const shares = positions[positionId(item.conditionId, candidate.tokenId)]?.shares ?? 0;
        if (shares > EPS) map[candidate.tokenId] = shares;
      }
    }
    return map;
  }, [hydrated, positions, markets]);

  const hasAnyPosition = Object.keys(heldByToken).length > 0;
  const position =
    market && tokenId ? positions[positionId(market.conditionId, tokenId)] : undefined;
  const heldShares = hydrated ? (position?.shares ?? 0) : 0;

  // Пока портфель не поднят из localStorage, «позиций нет» ещё ничего не значит —
  // фильтровать по ним нельзя, иначе форма продажи мигает пустотой.
  // На вкладке плеча позиций не существует: там доступны все исходы.
  const sellMode = side === "SELL" && hydrated && !leverageMode;

  // В продаже показываем только рынки, по которым реально есть что продавать.
  const pickerMarkets = useMemo(() => {
    if (!sellMode) return markets;
    const withPosition = markets.filter((item) =>
      item.outcomes.some((o) => o.tokenId && (heldByToken[o.tokenId] ?? 0) > 0),
    );
    if (market && !withPosition.some((item) => item.id === market.id)) {
      return [market, ...withPosition];
    }
    return withPosition;
  }, [sellMode, markets, heldByToken, market]);

  /* ----------------------------- форма ------------------------------ */

  const [amountText, setAmountText] = useState("");
  const [sharesText, setSharesText] = useState("");
  const [limitPrice, setLimitPrice] = useState<number | null>(null);
  const [shown, setShown] = useState<{ key: string; quote: Quote } | null>(null);
  const [priceAlert, setPriceAlert] = useState<PriceAlert | null>(null);

  // Размер, лимит и предупреждение о цене привязаны к конкретному исходу и
  // стороне сделки — при смене сбрасываем прямо в рендере (рекомендованная
  // альтернатива эффекту, лишнего кадра не будет).
  const formKey = `${token}|${side}`;
  const [prevFormKey, setPrevFormKey] = useState(formKey);
  if (prevFormKey !== formKey) {
    setPrevFormKey(formKey);
    setAmountText("");
    setSharesText("");
    setLimitPrice(null);
    setPriceAlert(null);
  }

  /* ----------------------------- стакан ----------------------------- */

  const { data: book, isPending: bookPending } = useQuery({
    queryKey: queryKeys.book(token),
    queryFn: ({ signal }) => api.book(token, signal),
    enabled: token.length > 0,
    refetchInterval: REFRESH.book,
    // Общий staleTime дал бы при возврате на исход книгу двадцатисекундной давности.
    staleTime: 0,
  });

  /* --------------------------- котировка ---------------------------- */

  const amount = toPositive(amountText);
  const sellShares = toPositive(sharesText);
  const sizeEntered = side === "BUY" ? amount > 0 : sellShares > 0;

  /** Расчёт по самому свежему стакану — с ним сверяемся при отправке. */
  const freshQuote = useMemo<Quote | null>(() => {
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

  // Стакан обновляется каждые несколько секунд, и цифры под кнопкой не должны
  // «прыгать» ровно в момент клика. Поэтому расчёт фиксируется на момент ввода
  // и меняется, только когда пользователь сам поменял заявку.
  const quoteKey = `${token}|${side}|${side === "BUY" ? amount : sellShares}|${limitPrice ?? ""}`;
  if (freshQuote) {
    if (shown?.key !== quoteKey) {
      setShown({ key: quoteKey, quote: freshQuote });
      if (priceAlert) setPriceAlert(null);
    }
  } else if (shown) {
    setShown(null);
  }
  const shownQuote = shown?.key === quoteKey ? shown.quote : null;

  const estimatedPnl =
    side === "SELL" && shownQuote && !shownQuote.error && position
      ? shownQuote.total - shownQuote.shares * position.avgPrice
      : null;

  // Переоценка по середине спреда: по лучшему биду позиция сразу после покупки
  // выглядела бы убыточной ровно на спред.
  const markPrice = book?.midpoint ?? outcome?.price ?? 0;
  const unrealized = position ? positionPnl(position, markPrice) : 0;

  const disabledReason = useMemo(() => {
    if (!market || !tokenId) return "Исход недоступен";
    // Продать позицию из закрытого рынка можно, купить — нет.
    if (side === "BUY" && !tradable) return "Торговля закрыта";
    if (!hydrated) return "Загрузка счёта…";
    if (side === "SELL" && heldShares <= EPS) return "Нет позиции";
    if (!sizeEntered) return side === "BUY" ? "Введите сумму" : "Введите количество";
    if (bookPending || !book) return "Загрузка стакана…";
    if (shownQuote?.error) return translateTradeError(shownQuote.error);
    if (!shownQuote || shownQuote.shares <= 0) return "Заявку нельзя исполнить";
    if (side === "BUY" && shownQuote.total > cash + EPS) return "Недостаточно средств";
    if (side === "SELL" && sellShares > heldShares + EPS) return "Недостаточно акций";
    return null;
  }, [
    market,
    tokenId,
    tradable,
    hydrated,
    sizeEntered,
    side,
    bookPending,
    book,
    shownQuote,
    cash,
    sellShares,
    heldShares,
  ]);

  /* ---------------------------- действия ---------------------------- */

  const select = useCallback(
    (nextMarket: Market, nextIndex: number) => {
      let index = nextMarket.outcomes[nextIndex] ? nextIndex : 0;
      if (sellMode) {
        const held = (i: number) => {
          const id = nextMarket.outcomes[i]?.tokenId;
          return id ? (heldByToken[id] ?? 0) : 0;
        };
        if (held(index) <= 0) {
          const first = nextMarket.outcomes.findIndex(
            (o) => o.tokenId && (heldByToken[o.tokenId] ?? 0) > 0,
          );
          if (first >= 0) index = first;
        }
      }
      setInner({ marketId: nextMarket.id, outcomeIndex: index });
      onSelect?.(nextMarket, index);
    },
    [onSelect, sellMode, heldByToken],
  );

  function handleSide(nextSide: Side) {
    setSide(nextSide);
    if (nextSide !== "SELL" || heldShares > EPS) return;
    // Переключились на продажу с исхода без позиции — уводим на первый с позицией.
    for (const item of markets) {
      const index = item.outcomes.findIndex(
        (o) => o.tokenId && (heldByToken[o.tokenId] ?? 0) > 0,
      );
      if (index >= 0) {
        setInner({ marketId: item.id, outcomeIndex: index });
        onSelect?.(item, index);
        return;
      }
    }
  }

  function handleSubmit() {
    if (disabledReason || !market || !outcome || !tokenId || !shownQuote) return;

    // Стакан живёт своей жизнью: между показом расчёта и кликом цена могла уйти.
    if (!freshQuote || freshQuote.error || freshQuote.shares <= 0) {
      setShown({ key: quoteKey, quote: freshQuote ?? shownQuote });
      setPriceAlert(null);
      toast.error(
        "Заявку не исполнить",
        translateTradeError(freshQuote?.error) ?? "Стакан изменился — проверьте расчёт",
      );
      return;
    }

    const drift =
      side === "BUY"
        ? freshQuote.avgPrice - shownQuote.avgPrice
        : shownQuote.avgPrice - freshQuote.avgPrice;

    if (drift > MAX_PRICE_DRIFT) {
      // Показываем новые цифры и ждём повторного клика — молча по худшей цене нет.
      setShown({ key: quoteKey, quote: freshQuote });
      setPriceAlert({ from: shownQuote.avgPrice, to: freshQuote.avgPrice });
      return;
    }

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
      shares: freshQuote.shares,
      price: freshQuote.avgPrice,
      fee: freshQuote.fee,
    };

    const result = side === "BUY" ? buyAction(args) : sellAction(args);
    if (!result.ok) {
      toast.error("Сделка не прошла", translateTradeError(result.error) ?? undefined);
      return;
    }

    const details = `${formatCompact(freshQuote.shares)} акц. ${outcome.label} по ${formatCents(
      freshQuote.avgPrice,
    )}`;
    if (side === "BUY") {
      toast.success(`Куплено на ${formatMoney(freshQuote.total)}`, details);
      setAmountText("");
    } else {
      toast.success(`Продано на ${formatMoney(freshQuote.total)}`, details);
      setSharesText("");
    }
    setLimitPrice(null);
    setPriceAlert(null);
  }

  /* ------------------------------ вид ------------------------------- */

  const buyChips: AmountChip[] = [
    { label: "+$1", onClick: () => setAmountText(toField(amount + 1)) },
    { label: "+$20", onClick: () => setAmountText(toField(amount + 20)) },
    { label: "+$100", onClick: () => setAmountText(toField(amount + 100)) },
    {
      label: "Max",
      onClick: () => setAmountText(toField(cash)),
      disabled: !hydrated,
      strong: true,
    },
  ];

  const sellChips: AmountChip[] = [
    { label: "25%", onClick: () => setSharesText(toSharesField(heldShares * 0.25)) },
    { label: "50%", onClick: () => setSharesText(toSharesField(heldShares * 0.5)) },
    { label: "Max", onClick: () => setSharesText(toSharesField(heldShares)), strong: true },
  ].map((chip) => ({ ...chip, disabled: !hydrated || heldShares <= EPS }));

  const headline = market?.groupTitle?.trim() || market?.question || event.title;

  /** Открытая торговля по цене 0/1 — рынок уже определился по факту. */
  const resolvedNotice =
    tradable && outcome && outcome.price >= 1 - RESOLVED_EPS
      ? `Исход стоит ${formatCents(outcome.price, 0)}: рынок фактически определился, покупка почти не даёт доходности.`
      : tradable && outcome && outcome.price <= RESOLVED_EPS
        ? `Исход стоит ${formatCents(outcome.price, 0)}: рынок фактически определился, встречных заявок может не быть.`
        : null;

  const submitLabel = priceAlert
    ? `Подтвердить по ${formatCents(priceAlert.to)}`
    : shownQuote?.partial
      ? side === "BUY"
        ? `Купить на ${formatMoney(shownQuote.cost)} — частично`
        : `Продать ${formatCompact(shownQuote.shares)} акц. — частично`
      : `${side === "BUY" ? "Купить" : "Продать"} ${outcome?.label ?? ""}`.trim();

  // Продавать нечего во всём событии — форма здесь бесполезна.
  const sellEmpty = side === "SELL" && hydrated && !hasAnyPosition;

  /** Подзаголовок панели: чем именно она сейчас является. */
  const kicker = leverageMode
    ? "Плечевая сделка"
    : side === "BUY"
      ? "Покупка исхода"
      : "Продажа позиции";

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* overflow-hidden здесь намеренно нет: подсказки <Hint/> должны выходить
          за пределы карточки, иначе их обрезает по краю панели. */}
      <section className="card">
        <div className="border-b border-border px-3 py-3">
          <SegmentedControl
            items={MODE_ITEMS}
            value={mode}
            onChange={setMode}
            className="flex w-full [&>button]:flex-1"
          />
        </div>

        <header className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
              {kicker}
              {outcome ? ` · ${outcome.label}` : ""}
            </p>
            {!tradable && <Badge tone="neutral">Торги закрыты</Badge>}
          </div>
          <h2 className="mt-1.5 line-clamp-2 text-[15px] font-semibold leading-[1.32] text-text">
            {headline}
          </h2>
        </header>

        {leverageMode ? (
          market && outcome ? (
            <>
              <div className="px-5 pt-4">
                <OutcomeSelector
                  label="Исход"
                  markets={markets}
                  market={market}
                  outcomeIndex={outcomeIndex}
                  onSelect={select}
                  disabled={!tradable}
                  heldByToken={heldByToken}
                  eventClosed={event.closed}
                />
              </div>
              <LeveragePanel event={event} market={market} outcome={outcome} />
            </>
          ) : (
            <EmptyState
              title="Исход недоступен"
              description="Плечо открывается по конкретному исходу, а торгуемых исходов у события нет."
              className="py-10"
            />
          )
        ) : sellEmpty ? (
          <EmptyState
            title="Нет позиций по этому событию"
            description="Продавать нечего: сначала купите исход — он появится здесь."
            className="py-10"
            action={
              <Button type="button" size="sm" onClick={() => handleSide("BUY")}>
                Перейти к покупке
              </Button>
            }
          />
        ) : (
          <>
            <div className="space-y-4 p-5">
              <SegmentedControl
                items={SIDE_ITEMS}
                value={side}
                onChange={handleSide}
                className="flex w-full [&>button]:flex-1"
              />

              <OutcomeSelector
                label={sellMode ? "Что продаёте" : "Исход"}
                markets={pickerMarkets}
                market={market}
                outcomeIndex={outcomeIndex}
                onSelect={select}
                disabled={side === "BUY" && !tradable}
                sellMode={sellMode}
                heldByToken={heldByToken}
                eventClosed={event.closed}
              />

              {!tradable && (
                <div className="flex items-start gap-2 rounded-[12px] bg-bg-subtle px-3 py-2 text-[11.5px] leading-relaxed text-muted">
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <p>
                    Рынок не принимает заявки — купить нельзя.
                    {heldShares > EPS
                      ? " Продать позицию можно, пока в стакане есть заявки."
                      : ""}
                  </p>
                </div>
              )}

              {resolvedNotice && <TradeNotice>{resolvedNotice}</TradeNotice>}

              {limitPrice != null && (
                <div className="flex items-center justify-between gap-2 rounded-[12px] bg-accent-soft px-3 py-2 text-[11.5px] text-accent">
                  <span>
                    Лимитная цена{" "}
                    <span className="tnum font-semibold">{formatCents(limitPrice)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setLimitPrice(null)}
                    aria-label="Сбросить лимитную цену"
                    className="-m-1 cursor-pointer rounded-[8px] p-1 transition-opacity hover:opacity-70"
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
                  disabled={!tradable}
                  invalid={disabledReason === "Недостаточно средств"}
                  hint={hydrated ? `Доступно ${formatMoney(cash)}` : undefined}
                />
              ) : (
                <AmountInput
                  mode="shares"
                  label="Количество"
                  value={sharesText}
                  onChange={setSharesText}
                  chips={sellChips}
                  disabled={heldShares <= EPS}
                  invalid={disabledReason === "Недостаточно акций"}
                  hint={
                    hydrated ? `В позиции ${formatCompact(heldShares)} акц.` : undefined
                  }
                />
              )}

              <QuoteSummary
                side={side}
                quote={shownQuote}
                loading={sizeEntered && bookPending}
                outcomeLabel={outcome?.label}
                perDollar={outcome ? estimateReturn(outcome.price) : undefined}
                estimatedPnl={estimatedPnl}
                priceAlert={priceAlert}
              />

              <Button
                type="button"
                fullWidth
                size="lg"
                variant={tone}
                disabled={Boolean(disabledReason)}
                onClick={handleSubmit}
                className={cn(
                  "h-[52px] overflow-hidden rounded-[14px] text-[15px] font-semibold",
                  // На заблокированной кнопке написана причина — её нельзя гасить
                  // до полупрозрачного: opacity примитива здесь снимается.
                  disabledReason
                    ? "bg-bg-subtle text-muted ring-1 ring-inset ring-border disabled:opacity-100"
                    : // В тёмной теме изумруд и роза светлые — подпись берёт цвет фона.
                      tone === "no"
                      ? "bg-no text-white hover:bg-no-hover dark:text-bg"
                      : "bg-yes text-white hover:bg-yes-hover dark:text-bg",
                )}
              >
                <span className="truncate">{disabledReason ?? submitLabel}</span>
              </Button>
            </div>

            <StatRow className="border-t border-border px-5 py-4">
              <Stat
                size="sm"
                label="Доступно"
                value={hydrated ? formatMoney(cash) : <Skeleton className="h-4 w-16" />}
                hint="бумажный счёт"
              />
              <Stat
                size="sm"
                label={`Позиция${outcome ? ` · ${outcome.label}` : ""}`}
                value={
                  !hydrated ? (
                    <Skeleton className="h-4 w-16" />
                  ) : position && heldShares > EPS ? (
                    `${formatCompact(heldShares)} акц.`
                  ) : (
                    "—"
                  )
                }
                hint={
                  hydrated && position && heldShares > EPS ? (
                    <span className="tnum">
                      {formatCents(position.avgPrice)} ·{" "}
                      <span
                        className={cn(
                          "font-semibold",
                          unrealized > 0 && "text-yes",
                          unrealized < 0 && "text-no",
                        )}
                      >
                        {formatSignedMoney(unrealized)}
                      </span>
                    </span>
                  ) : (
                    "ничего не куплено"
                  )
                }
              />
            </StatRow>
          </>
        )}
      </section>

      {showOrderBook && (
        <OrderBookPanel
          tokenId={token}
          tickSize={market?.tickSize}
          outcomeLabel={outcome?.label}
          marketTitle={market?.groupTitle ?? market?.question}
          // Лимитная цена — понятие спота: у плеча вход всегда по рынку.
          onSelectPrice={leverageMode ? undefined : setLimitPrice}
        />
      )}

      <ToastViewport />
    </div>
  );
}
