"use client";

/**
 * Панель плечевой позиции — вторая вкладка панели сделки.
 *
 * Герой здесь не выплата, а НОКАУТ-ЦЕНА: у плечевой позиции главный вопрос —
 * не «сколько я получу», а «на каком уровне я всё потеряю». Поэтому крупным
 * числом идёт нокаут, под ним расстояние до него, а честное предупреждение о
 * полной потере маржи стоит рядом, а не мелким шрифтом внизу.
 *
 * Считает всё @/lib/pricing/leverage: экспозицию, нокаут, спред и
 * финансирование. Здесь только ввод и отображение — своей математики в
 * компоненте нет намеренно, иначе цифры разъедутся с движком.
 *
 * Тост-вьюпорт рендерит trade-panel.tsx, поэтому здесь только `useToast()`:
 * второй <ToastViewport/> показал бы каждое уведомление дважды.
 */

import { Lock } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { AmountInput, type AmountChip } from "./amount-input";
import { PayoffChart } from "./payoff-chart";
import { Metric, MetricList, TradeHero } from "./quote-summary";
import { useToast } from "./toast";
import { Button } from "@/components/ui/button";
import { Hint, Note } from "@/components/ui/hint";
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

const KNOCKOUT_HINT =
  "Нокаут — цена, на которой внесённая маржа исчерпана. Позиция закрывается автоматически, маржа теряется целиком, и вернувшаяся обратно цена её не восстановит.";

const LEVERAGE_HINT =
  "Плечо умножает и прибыль, и убыток: на 5x каждый цент движения цены стоит в пять раз дороже, а нокаут стоит в пять раз ближе к текущей цене.";

const EXPOSURE_HINT =
  "Экспозиция — размер позиции: маржа, умноженная на плечо. Прибыль и убыток считаются от неё, а не от внесённой суммы.";

const SPREAD_HINT =
  "Спред — разовая плата площадки за открытие, доля от экспозиции. Она уже вычтена из результата на графике.";

const FUNDING_HINT =
  "Финансирование — ежедневная плата за заёмную часть экспозиции. Чем дольше держите позицию, тем больше она съедает.";

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

  const chips: AmountChip[] = [
    { label: "+$10", onClick: () => setMarginText(toField(margin + 10)) },
    { label: "+$50", onClick: () => setMarginText(toField(margin + 50)) },
    { label: "+$200", onClick: () => setMarginText(toField(margin + 200)) },
    {
      label: "Max",
      onClick: () => setMarginText(toField(cash)),
      disabled: !hydrated,
      strong: true,
    },
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

  return (
    <div className={cn("space-y-4 p-5 pt-4", className)}>
      <div>
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
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          {isLong
            ? `Прибыль, если «${outcome.label}» дорожает: каждый цент роста умножается на плечо.`
            : `Прибыль, если «${outcome.label}» дешевеет: каждый цент падения умножается на плечо.`}
        </p>
      </div>

      <AmountInput
        mode="amount"
        label="Маржа"
        value={marginText}
        onChange={setMarginText}
        chips={chips}
        disabled={!tradable}
        invalid={disabledReason === "Недостаточно средств"}
        hint={hydrated ? `Доступно ${formatMoney(cash)}` : undefined}
      />

      {/* ---------------------------- плечо ---------------------------- */}

      <div className="rounded-[14px] border border-border bg-bg-subtle px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          {/* Капитель — только на самом слове: текст подсказки внутри
              uppercase-контейнера тоже стал бы капителью и не читался. */}
          <span className="flex items-center gap-1 text-faint">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.08em]">
              Плечо
            </span>
            <Hint>{LEVERAGE_HINT}</Hint>
          </span>
          <span
            className={cn(
              "display tnum text-[24px] leading-none",
              isLong ? "text-yes" : "text-no",
            )}
          >
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
          className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-grid disabled:cursor-not-allowed disabled:opacity-50"
          style={{ accentColor: isLong ? "var(--yes)" : "var(--no)" }}
        />

        <div className="tnum mt-2 flex items-center justify-between text-[10.5px] text-faint">
          <span>{formatLeverage(MIN_LEVERAGE)}</span>
          <span>
            максимум {formatLeverage(maxAllowed)}
            {endDate ? ` · ${formatTimeLeft(endDate)}` : ""}
          </span>
        </div>
      </div>

      {/* --------------------------- расчёт ---------------------------- */}

      <TradeHero
        kicker="Нокаут-цена"
        hint={KNOCKOUT_HINT}
        value={!hasQuote ? "—" : reachable ? formatCents(quote.knockoutPrice) : "нет"}
        tone={!hasQuote ? "muted" : reachable ? "no" : "neutral"}
        alarm={reachable}
        note={
          !hasQuote ? (
            <>
              Текущая цена исхода{" "}
              <span className="font-semibold text-text">{formatCents(entryPrice)}</span> — введите
              маржу, чтобы увидеть, где сгорит позиция
            </>
          ) : reachable ? (
            <>
              <span className="font-semibold text-no">{formatPoints(quote.distanceToKnockout)}</span>{" "}
              от текущих{" "}
              <span className="font-semibold text-text">{formatCents(entryPrice)}</span> — столько
              цена может пройти против вас
            </>
          ) : (
            "На этом плече нокаут лежит вне диапазона цен: сгореть позиция не может"
          )
        }
      />

      <MetricList>
        <Metric
          label="Экспозиция"
          hint={EXPOSURE_HINT}
          value={hasQuote ? formatMoney(quote.exposure) : "—"}
        />
        <Metric label="Токенов" value={hasQuote ? formatCompact(quote.tokens) : "—"} />
        <Metric
          label="Спред при открытии"
          hint={SPREAD_HINT}
          value={hasQuote ? formatMoney(quote.spreadCost) : "—"}
        />
        <Metric
          label="Финансирование в день"
          hint={FUNDING_HINT}
          value={hasQuote ? formatMoney(quote.fundingPerDay) : "—"}
          tone={hasQuote && quote.fundingPerDay > 0 ? "text-warn" : undefined}
        />
        <Metric
          label="Максимальный убыток"
          value={hasQuote ? formatMoney(quote.margin) : "—"}
          strong
          divider
        />
      </MetricList>

      {hasQuote && (
        <div className="rounded-[14px] border border-border bg-surface px-3 py-3">
          <p className="mb-1 px-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
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
        <Note>
          На таком плече нокаут-цена лежит за границей диапазона — сгореть позиция не может.
          Максимум, что вы потеряете, — маржа {formatMoney(margin)}, если исход разрешится
          против вас.
        </Note>
      ) : (
        <Note tone="warn">
          Если цена коснётся нокаут-цены, позиция закроется сама, а маржа
          {hasQuote ? ` ${formatMoney(margin)} ` : " "}
          будет потеряна целиком. Вернувшаяся обратно цена её не восстановит — позиции уже не
          будет. Чем больше плечо, тем ближе нокаут к текущей цене.
        </Note>
      )}

      {!tradable && (
        <div className="flex items-start gap-2 rounded-[12px] bg-bg-subtle px-3 py-2 text-[11.5px] text-muted">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
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
          "h-[52px] rounded-[14px] text-[15px] font-semibold",
          // На заблокированной кнопке написана причина — её нельзя гасить
          // до полупрозрачного: opacity примитива здесь снимается.
          disabledReason
            ? "bg-bg-subtle text-muted ring-1 ring-inset ring-border disabled:opacity-100"
            : // В тёмной теме изумруд и роза светлые — подпись берёт цвет фона.
              isLong
              ? "bg-yes text-white hover:bg-yes-hover dark:text-bg"
              : "bg-no text-white hover:bg-no-hover dark:text-bg",
        )}
      >
        {disabledReason ?? `Открыть ${isLong ? "лонг" : "шорт"} ${formatLeverage(effectiveLeverage)}`}
      </Button>
    </div>
  );
}
