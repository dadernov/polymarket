"use client";

/**
 * Панель плечевой позиции — вторая вкладка панели сделки.
 *
 * Считает всё @/lib/pricing/leverage: экспозицию, нокаут-цену, спред и
 * финансирование. Здесь только ввод, отображение и одна кнопка — своей
 * математики в компоненте нет намеренно, иначе цифры разъедутся с движком.
 *
 * Тост-вьюпорт рендерит trade-panel.tsx, поэтому здесь только `useToast()`:
 * второй <ToastViewport/> показал бы каждое уведомление дважды.
 */

import { AlertTriangle, Info, Lock } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { PayoffChart } from "./payoff-chart";
import { useToast } from "./toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/tabs";
import {
  formatCents,
  formatCompact,
  formatMoney,
  formatTimeLeft,
} from "@/lib/format";
import {
  LEVERAGE_DEFAULTS,
  maxLeverage,
  quoteLeverage,
  type LeverageSide,
} from "@/lib/pricing/leverage";
import { useHydrated, usePortfolioStore } from "@/lib/store";
import { useLeverage } from "@/lib/store/leverage";
import type { Market, MarketEvent, Outcome } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIDE_ITEMS: { value: LeverageSide; label: string }[] = [
  { value: "LONG", label: "Лонг" },
  { value: "SHORT", label: "Шорт" },
];

/** Движок и стор говорят по-английски — показываем по-русски. */
const MESSAGES: Record<string, string> = {
  "Enter a margin": "Введите маржу",
  "Invalid entry price": "Цена исхода не подходит для плеча",
  "Leverage must be at least 1x": "Минимальное плечо 1x",
  [`Leverage above ${LEVERAGE_DEFAULTS.maxLeverage}x`]: `Максимум ${LEVERAGE_DEFAULTS.maxLeverage}x`,
  "Position is too large": "Позиция слишком большая",
  "Knockout is too close to the entry price": "Нокаут слишком близко к цене входа",
  "Insufficient balance": "Недостаточно средств",
  "Market is missing": "Рынок недоступен",
};

function translateLeverageError(error: string | null | undefined): string | null {
  if (!error) return null;
  return MESSAGES[error] ?? error;
}

/** Шаг ползунка плеча. */
const LEVERAGE_STEP = 0.5;
const MIN_LEVERAGE = 1;
const DEFAULT_LEVERAGE = 2;

const EPS = 1e-6;

function toPositive(text: string): number {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function floor2(value: number): number {
  return Math.floor(Math.max(0, value) * 100) / 100;
}

function toField(value: number): string {
  const floored = floor2(value);
  return floored > 0 ? String(floored) : "";
}

/** Только цифры и одна точка — то же правило, что в AmountInput. */
function sanitize(raw: string): string {
  const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [head = "", ...rest] = cleaned.split(".");
  const integer = head.slice(0, 9);
  if (rest.length === 0) return integer;
  return `${integer}.${rest.join("").slice(0, 2)}`;
}

/** Плечо показываем как 3x и 3.5x — без лишнего нуля. */
function formatLeverage(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}x`;
}

/** Расстояние до нокаута — в процентных пунктах цены. */
function formatPoints(distance: number): string {
  if (!Number.isFinite(distance)) return "—";
  return `${(Math.abs(distance) * 100).toFixed(1)} п.п.`;
}

/** Максимум с ползунка всегда лежит на сетке шага. */
function snapMax(value: number): number {
  if (!Number.isFinite(value) || value <= MIN_LEVERAGE) return MIN_LEVERAGE;
  return Math.max(MIN_LEVERAGE, Math.floor(value / LEVERAGE_STEP) * LEVERAGE_STEP);
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={cn("tnum text-right font-medium text-text", tone)}>{value}</span>
    </div>
  );
}

export interface LeveragePanelProps {
  event: MarketEvent;
  market: Market;
  outcome: Outcome;
  className?: string;
}

export function LeveragePanel({
  event,
  market,
  outcome,
  className,
}: LeveragePanelProps) {
  const toast = useToast();

  const hydrated = useHydrated();
  const cash = usePortfolioStore((state) => state.cash);
  const openPosition = useLeverage((state) => state.openPosition);

  const [side, setSide] = useState<LeverageSide>("LONG");
  const [marginText, setMarginText] = useState("");
  const [leverage, setLeverage] = useState(DEFAULT_LEVERAGE);

  const entryPrice = outcome.price;
  const tokenId = outcome.tokenId;
  const tradable =
    !event.closed && !market.closed && market.acceptingOrders && Boolean(tokenId);
  const endDate = market.endDate ?? event.endDate;

  // Максимум зависит от цены и срока: у дешёвого исхода и у рынка, который
  // закрывается послезавтра, места до нокаута мало.
  const maxAllowed = useMemo(
    () => snapMax(maxLeverage({ price: entryPrice, endDate, tickSize: market.tickSize })),
    [entryPrice, endDate, market.tickSize],
  );

  // Цена ушла — максимум мог упасть ниже выбранного плеча. Правим в рендере,
  // чтобы ползунок и расчёт никогда не показывали недостижимое значение.
  const effectiveLeverage = Math.min(Math.max(leverage, MIN_LEVERAGE), maxAllowed);
  if (effectiveLeverage !== leverage) setLeverage(effectiveLeverage);

  const margin = toPositive(marginText);

  const quote = useMemo(
    () =>
      quoteLeverage({
        side,
        entryPrice,
        margin,
        leverage: effectiveLeverage,
        tickSize: market.tickSize,
        spreadBps: LEVERAGE_DEFAULTS.spreadBps,
        fundingBpsPerDay: LEVERAGE_DEFAULTS.fundingBpsPerDay,
      }),
    [side, entryPrice, margin, effectiveLeverage, market.tickSize],
  );

  const pnlAt = useCallback((price: number) => quote.pnlAt(price), [quote]);

  const hasQuote = margin > 0 && !quote.error;
  /** Шорт с малым плечом: нокаут выше 1, дойти до него цена не может. */
  const reachable = hasQuote && quote.knockoutReachable;

  const disabledReason = useMemo(() => {
    if (!tokenId) return "Исход недоступен";
    if (!tradable) return "Торговля закрыта";
    if (!hydrated) return "Загрузка счёта…";
    if (margin <= 0) return "Введите маржу";
    if (margin > cash + EPS) return "Недостаточно средств";
    if (effectiveLeverage > maxAllowed + EPS)
      return `Максимум ${formatLeverage(maxAllowed)}`;
    if (quote.error) return translateLeverageError(quote.error);
    return null;
  }, [
    tokenId,
    tradable,
    hydrated,
    margin,
    cash,
    effectiveLeverage,
    maxAllowed,
    quote.error,
  ]);

  const chips = [
    { label: "+$10", onClick: () => setMarginText(toField(margin + 10)) },
    { label: "+$50", onClick: () => setMarginText(toField(margin + 50)) },
    { label: "+$200", onClick: () => setMarginText(toField(margin + 200)) },
    { label: "Max", onClick: () => setMarginText(toField(cash)), disabled: !hydrated },
  ];

  function handleSubmit() {
    if (disabledReason || !tokenId) return;

    const result = openPosition({
      eventSlug: event.slug,
      eventTitle: event.title,
      marketQuestion: market.question,
      conditionId: market.conditionId,
      tokenId,
      outcomeLabel: outcome.label,
      icon: market.icon ?? market.image ?? event.icon ?? event.image,
      side,
      margin,
      leverage: effectiveLeverage,
      entryPrice,
      tickSize: market.tickSize,
    });

    if (!result.ok) {
      toast.error("Позиция не открыта", translateLeverageError(result.error) ?? undefined);
      return;
    }

    toast.success(
      `${side === "LONG" ? "Лонг" : "Шорт"} ${formatLeverage(effectiveLeverage)} открыт`,
      `Маржа ${formatMoney(margin)} · ${
        quote.knockoutReachable
          ? `нокаут ${formatCents(quote.knockoutPrice)}`
          : "нокаут недостижим"
      }`,
    );
    setMarginText("");
  }

  const isLong = side === "LONG";
  const sideTone = isLong ? "text-yes" : "text-no";

  return (
    <div className={cn("space-y-3 p-3", className)}>
      <SegmentedControl
        items={SIDE_ITEMS}
        value={side}
        onChange={setSide}
        className={cn(
          "flex w-full [&>button]:flex-1",
          isLong
            ? "[&_button[aria-pressed='true']]:text-yes"
            : "[&_button[aria-pressed='true']]:text-no",
        )}
      />

      <p className="text-[11px] leading-relaxed text-faint">
        {isLong
          ? `Прибыль, если ${outcome.label} дорожает: каждый цент роста умножается на плечо.`
          : `Прибыль, если ${outcome.label} дешевеет: каждый цент падения умножается на плечо.`}
      </p>

      {/* ---------------------------- маржа ---------------------------- */}

      <div className="space-y-2">
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border bg-bg-subtle px-3 py-2.5 transition-colors",
            disabledReason === "Недостаточно средств"
              ? "border-no"
              : "border-border focus-within:border-border-strong",
            !tradable && "opacity-60",
          )}
        >
          <span className="shrink-0 text-xs font-medium text-muted">Маржа</span>

          <div className="flex min-w-0 flex-1 items-baseline justify-end gap-1">
            <span
              className={cn(
                "text-2xl font-semibold leading-none",
                marginText.length === 0 ? "text-faint" : "text-text",
              )}
            >
              $
            </span>
            {/* Невидимый двойник задаёт ширину поля по содержимому. */}
            <span className="grid min-w-0 max-w-full">
              <span
                aria-hidden
                className="tnum invisible col-start-1 row-start-1 whitespace-pre px-px text-2xl font-semibold leading-none"
              >
                {marginText || "0"}
              </span>
              <input
                type="text"
                inputMode="decimal"
                size={1}
                autoComplete="off"
                spellCheck={false}
                placeholder="0"
                value={marginText}
                disabled={!tradable}
                aria-label="Маржа в долларах"
                onChange={(e) => setMarginText(sanitize(e.target.value))}
                className={cn(
                  "tnum col-start-1 row-start-1 w-full min-w-0 bg-transparent px-px",
                  "text-right text-2xl font-semibold leading-none text-text outline-none",
                  "placeholder:text-faint",
                )}
              />
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <Button
              key={chip.label}
              type="button"
              variant="secondary"
              size="xs"
              disabled={!tradable || chip.disabled}
              onClick={chip.onClick}
              className="tnum"
            >
              {chip.label}
            </Button>
          ))}
        </div>

        {hydrated ? (
          <p className="tnum text-right text-xs text-faint">Доступно {formatMoney(cash)}</p>
        ) : (
          <div className="flex justify-end">
            <Skeleton className="h-3.5 w-24" />
          </div>
        )}
      </div>

      {/* ---------------------------- плечо ---------------------------- */}

      <div className="space-y-2 rounded-xl border border-border bg-bg-subtle p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-medium text-muted">Плечо</span>
          <span className={cn("tnum text-xl font-semibold leading-none", sideTone)}>
            {formatLeverage(effectiveLeverage)}
          </span>
        </div>

        <input
          type="range"
          min={MIN_LEVERAGE}
          max={maxAllowed}
          step={LEVERAGE_STEP}
          value={effectiveLeverage}
          disabled={!tradable || maxAllowed <= MIN_LEVERAGE}
          aria-label="Плечо"
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          style={{ accentColor: isLong ? "var(--yes)" : "var(--no)" }}
        />

        <div className="tnum flex items-center justify-between text-[11px] text-faint">
          <span>{formatLeverage(MIN_LEVERAGE)}</span>
          <span>
            максимум {formatLeverage(maxAllowed)}
            {endDate ? ` · ${formatTimeLeft(endDate)}` : ""}
          </span>
        </div>
      </div>

      {/* --------------------------- расчёт ---------------------------- */}

      <div
        className={cn(
          "rounded-xl border p-3",
          reachable ? "border-no/40 bg-no-soft" : "border-border bg-bg-subtle",
        )}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-medium text-muted">Нокаут-цена</span>
          <span
            className={cn(
              "tnum text-2xl font-semibold leading-none",
              reachable ? "text-no" : "text-faint",
            )}
          >
            {!hasQuote ? "—" : reachable ? formatCents(quote.knockoutPrice) : "нет"}
          </span>
        </div>
        <p className="tnum mt-1 text-right text-[11px] text-muted">
          {!hasQuote
            ? `текущая цена ${formatCents(entryPrice)}`
            : reachable
              ? `${formatPoints(quote.distanceToKnockout)} от текущих ${formatCents(entryPrice)}`
              : "на этом плече нокаут лежит вне диапазона цен"}
        </p>
      </div>

      <div className="space-y-1.5 rounded-xl border border-border bg-bg-subtle p-3 text-xs">
        <Row label="Экспозиция" value={hasQuote ? formatMoney(quote.exposure) : "—"} />
        <Row label="Токенов" value={hasQuote ? formatCompact(quote.tokens) : "—"} />
        <Row label="Спред" value={hasQuote ? formatMoney(quote.spreadCost) : "—"} />
        <Row
          label="Финансирование в день"
          value={hasQuote ? formatMoney(quote.fundingPerDay) : "—"}
          tone={hasQuote && quote.fundingPerDay > 0 ? "text-[color:var(--warn)]" : undefined}
        />
      </div>

      {hasQuote && (
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="mb-1 text-xs font-medium text-muted">
            Результат при цене исхода
          </p>
          <PayoffChart
            side={side}
            entryPrice={entryPrice}
            knockoutPrice={quote.knockoutPrice}
            pnlAt={pnlAt}
          />
        </div>
      )}

      {/* ------------------------ предупреждение ----------------------- */}

      {hasQuote && !reachable ? (
        <div className="flex items-start gap-2 rounded-lg bg-surface-hover px-2.5 py-2 text-xs leading-relaxed text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <p>
            На таком плече нокаут-цена лежит за границей диапазона — сгореть позиция
            не может. Максимум, что вы потеряете, — маржа {formatMoney(margin)}, если
            исход разрешится против вас.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg bg-[color:var(--warn)]/10 px-2.5 py-2 text-xs leading-relaxed text-[color:var(--warn)]">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <p>
            Если цена коснётся нокаут-цены, позиция закроется сама, а маржа
            {hasQuote ? ` ${formatMoney(margin)} ` : " "}
            будет потеряна целиком. Вернувшаяся обратно цена её не восстановит —
            позиции уже не будет. Чем больше плечо, тем ближе нокаут к текущей цене.
          </p>
        </div>
      )}

      {!tradable && (
        <div className="flex items-start gap-2 rounded-lg bg-surface-hover px-2.5 py-2 text-xs text-muted">
          <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
          <p>Рынок не принимает заявки — открыть плечевую позицию нельзя.</p>
        </div>
      )}

      <Button
        type="button"
        fullWidth
        size="lg"
        disabled={Boolean(disabledReason)}
        onClick={handleSubmit}
        className={cn(
          "h-12",
          !disabledReason &&
            (isLong
              ? "bg-yes text-white hover:bg-yes-hover"
              : "bg-no text-white hover:bg-no-hover"),
        )}
      >
        {disabledReason ?? `Открыть ${isLong ? "лонг" : "шорт"} ${formatLeverage(effectiveLeverage)}`}
      </Button>
    </div>
  );
}
