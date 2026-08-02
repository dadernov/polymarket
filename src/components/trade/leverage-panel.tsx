"use client";

/**
 * Панель плечевой позиции — вторая вкладка панели сделки.
 *
 * Герой здесь не выплата, а НОКАУТ-ЦЕНА: у плечевой позиции главный вопрос —
 * не «сколько я получу», а «на каком уровне я всё потеряю». Поэтому крупным
 * числом идёт нокаут, под ним расстояние до него в тиках, а честное
 * предупреждение о полной потере маржи стоит рядом, а не мелким шрифтом внизу.
 *
 * Считает всё @/lib/pricing/leverage — порт их бэкенда. Здесь только ввод и
 * отображение; своей математики в компоненте нет намеренно, иначе цифры
 * разъедутся с движком. Два блока в панели новые и объясняют цену продукта:
 *   • РАЗБОР ТАРИФА — капитал + гэп-премия + платформа, разово при открытии
 *     (спреда и ежедневного финансирования в этой модели нет);
 *   • ВЕРДИКТ ПУЛА — берёт ли пул на себя обязательство по этой позиции.
 *
 * Тост-вьюпорт рендерит trade-panel.tsx, поэтому здесь только `useToast()`:
 * второй <ToastViewport/> показал бы каждое уведомление дважды.
 */

import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { api, queryKeys } from "@/lib/api";

import { AmountInput, type AmountChip } from "./amount-input";
import { PayoffChart } from "./payoff-chart";
import { Metric, MetricList, TradeHero } from "./quote-summary";
import { useToast } from "./toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Hint, Note } from "@/components/ui/hint";
import { SegmentedControl } from "@/components/ui/tabs";
import { formatCents, formatCompact, formatMoney } from "@/lib/format";
import { DEFAULT_POOL_SHARES } from "@/lib/pricing/pool-risk";
import {
  CALIBRATION_INTERVAL,
  resolveLambdaSource,
} from "@/lib/pricing/calibration";
import { priceToTicks, ticksToPrice } from "@/lib/pricing/ticks";
import {
  LEVERAGE_DEFAULTS,
  maxLeverage,
  quoteLeverage,
  type LeverageQuoteErrorCode,
  type LeverageSide,
} from "@/lib/pricing/leverage";
import { useHydrated, usePortfolioStore } from "@/lib/store";
import {
  leveragePool,
  POOL_CAPITAL,
  useLeverage,
  useLeverageHydrated,
} from "@/lib/store/leverage";
import type { Market, MarketEvent, Outcome } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIDE_ITEMS: { value: LeverageSide; label: string }[] = [
  { value: "LONG", label: "Лонг" },
  { value: "SHORT", label: "Шорт" },
];

/** Плечо строго в (1, 5]. Ползунок начинается на шаг выше единицы. */
const LEVERAGE_STEP = 0.25;
const MIN_LEVERAGE = LEVERAGE_DEFAULTS.minLeverageExclusive + LEVERAGE_STEP;
const MAX_LEVERAGE = LEVERAGE_DEFAULTS.maxLeverage;
const DEFAULT_LEVERAGE = 2;

const EPS = 1e-6;

/** Сколько обязательств пул готов взять на один рынок. */
const MARKET_CAP = POOL_CAPITAL * DEFAULT_POOL_SHARES.perMarket;

/* ------------------------------ тексты ----------------------------- */

/** Коды движка переводим по коду, а не по тексту ошибки. */
const ERROR_TEXT: Record<LeverageQuoteErrorCode, string> = {
  margin: "Введите маржу",
  direction: "Сторона не выбрана",
  leverage_range: `Плечо от ${MIN_LEVERAGE}x до ${MAX_LEVERAGE}x`,
  entry_range: "Цена исхода не подходит для плеча",
  // На копеечной цене нокаут округляется обратно во вход — и это единственный
  // способ получить такой отказ: «слишком большое плечо» сказать было бы враньём.
  knockout_equals_entry: "Нокаут совпал бы с ценой входа",
  market_decided: "Рынок фактически определился — плечо недоступно",
};

/** Ошибки стора приходят строкой движка — показываем их по-русски. */
const STORE_ERRORS: Record<string, string> = {
  "Insufficient balance": "Недостаточно средств",
  "Market is missing": "Рынок недоступен",
  "Enter a margin": ERROR_TEXT.margin,
  "Invalid entry price": ERROR_TEXT.entry_range,
  "Invalid direction": ERROR_TEXT.direction,
  "Market has effectively resolved": ERROR_TEXT.market_decided,
  "Leverage is too high for this entry price": ERROR_TEXT.knockout_equals_entry,
  [`Leverage must be above ${LEVERAGE_DEFAULTS.minLeverageExclusive}x and at most ${MAX_LEVERAGE}x`]:
    ERROR_TEXT.leverage_range,
};

/** На кнопке — коротко; развёрнутая причина стоит в блоке вердикта над ней. */
const POOL_BLOCKED = "Пул не принимает позицию";

/** Причины отказа пула приходят префиксом: `per_market: перекос 500 > лимит 300`. */
const POOL_REASONS: Record<string, string> = {
  per_market: "Лимит пула на этот рынок исчерпан",
  per_cluster: "Лимит пула на группу связанных рынков исчерпан",
  global_stress: "Глобальный лимит пула исчерпан",
};

const KNOCKOUT_HINT =
  "Нокаут — цена, на которой внесённая маржа исчерпана. Позиция гаснет автоматически, маржа теряется целиком, и вернувшаяся обратно цена её не восстановит.";

const LEVERAGE_HINT =
  "Плечо умножает и прибыль, и убыток: на 5x каждый цент движения цены стоит в пять раз дороже, а нокаут стоит в пять раз ближе к текущей цене. Меньше 1x и больше 5x позиция не открывается.";

const EXPOSURE_HINT =
  "Экспозиция — размер позиции: маржа, умноженная на плечо. Прибыль и убыток считаются от неё, а не от внесённой суммы.";

const DISTANCE_HINT =
  "Тик — один цент вероятности. Цена в этой модели ходит только целыми тиками, поэтому расстояние до нокаута честнее мерить в них.";

const PAYOUT_HINT =
  "Максимальная выплата — сколько пул должен вам в самом лучшем случае. Именно её он резервирует под позицию и по ней считает свои лимиты.";

const TARIFF_HINT =
  "Тариф платится один раз при открытии и списывается вместе с маржой. Ни спреда, ни ежедневного финансирования в этой модели нет — это вся стоимость позиции.";

const CAPITAL_HINT =
  "Стоимость капитала — плата за то, что пул замораживает деньги под вашу максимальную выплату и не может пустить их в другое место. Считается от обязательства пула, а не от вашей маржи.";

const GAP_HINT =
  "Гэп-премия — плата за риск, что цена перепрыгнет нокаут-уровень насквозь одним движением и пул не успеет закрыть позицию ровно на нём. Разницу платит пул, поэтому она заложена в цену: чем ближе нокаут, тем чаще и крупнее такие перелёты.";

const PLATFORM_HINT =
  "Комиссия платформы — доля от вашей маржи. Единственная часть тарифа, которая не покрывает риск, а остаётся площадке.";

const POOL_HINT =
  "Пул — общий капитал, который выплачивает выигрыши. Чтобы не выгореть на одном событии, он ограничивает обязательства: не больше 3% капитала на один рынок, 10% на группу связанных рынков и 30% на всё сразу. Встречные позиции по одному рынку гасят друг друга и освобождают лимит.";

/* ---------------------------- утилиты ------------------------------ */

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

/** Плечо показываем как 3x и 3.25x — без лишних нулей. */
function formatLeverage(value: number): string {
  return `${Number.isInteger(value) ? value : String(value)}x`;
}

/** «1 тик», «2 тика», «20 тиков» — число расстояния читают вслух. */
function formatTicks(count: number): string {
  const n = Math.abs(Math.round(count));
  const tail = n % 10;
  const teen = n % 100;
  const word =
    tail === 1 && teen !== 11
      ? "тик"
      : tail >= 2 && tail <= 4 && (teen < 12 || teen > 14)
        ? "тика"
        : "тиков";
  return `${n} ${word}`;
}

/** Процент без знака: доля 0.5 → «50%». */
function formatShare(ratio: number): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${Math.round(Math.abs(ratio) * 100)}%`;
}

function formatPct(percent: number): string {
  if (!Number.isFinite(percent)) return "—";
  return `${percent.toFixed(1)}%`;
}

function translateStoreError(error: string | null | undefined): string | null {
  if (!error) return null;
  return STORE_ERRORS[error] ?? error;
}

/** Заголовок отказа пула и, если есть, его числовая расшифровка. */
function splitPoolReason(reason: string): { title: string; detail: string | null } {
  const index = reason.indexOf(":");
  const key = index >= 0 ? reason.slice(0, index).trim() : reason.trim();
  const detail = index >= 0 ? reason.slice(index + 1).trim() : "";
  return {
    title: POOL_REASONS[key] ?? "Пул не принимает эту позицию",
    detail: detail || null,
  };
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
  const positions = useLeverage((state) => state.positions);
  const leverageHydrated = useLeverageHydrated();

  const [side, setSide] = useState<LeverageSide>("LONG");
  const [marginText, setMarginText] = useState("");
  const [leverage, setLeverage] = useState(DEFAULT_LEVERAGE);

  const entryPrice = outcome.price;
  const tokenId = outcome.tokenId;
  const tradable =
    !event.closed && !market.closed && market.acceptingOrders && Boolean(tokenId);

  const margin = toPositive(marginText);

  // Пул заряжен уже открытыми позициями: вердикт должен учитывать неттинг,
  // а не проверять каждую позицию против пустого баланса.
  const pool = useMemo(
    () => leveragePool(leverageHydrated ? positions : {}),
    [positions, leverageHydrated],
  );

  /**
   * λ/J по истории самого рынка.
   *
   * В бэкенде эти числа зашиты одной таблицей — калибровкой единственного
   * биткоин-рынка; заказчик отмечает это ограничением. Но история цен у нас уже
   * есть, а калибровка — статистика приращений, поэтому считаем риск по данным
   * того рынка, который человек торгует. Интервал фиксирован: λ — доля шагов,
   * пробивших барьер, и она зависит от частоты выборки, так что менять шаг
   * нельзя, иначе числа перестанут быть сопоставимыми с эталоном.
   */
  const { data: calibrationSeries } = useQuery({
    queryKey: queryKeys.priceHistory(tokenId ?? "", CALIBRATION_INTERVAL),
    queryFn: ({ signal }) =>
      api.priceHistory(tokenId as string, CALIBRATION_INTERVAL, signal),
    enabled: Boolean(tokenId),
    staleTime: 300_000,
  });

  const lambda = useMemo(
    () => resolveLambdaSource(calibrationSeries),
    [calibrationSeries],
  );

  const quote = useMemo(
    () =>
      quoteLeverage({
        side,
        entryPrice,
        margin,
        leverage,
        marketId: market.conditionId,
        pool,
        lambdaSource: lambda.source,
      }),
    [side, entryPrice, margin, leverage, market.conditionId, pool, lambda.source],
  );

  const pnlAt = useCallback((price: number) => quote.pnlAt(price), [quote]);

  const hasQuote = margin > 0 && !quote.error;
  /** Нокаут лёг на границу диапазона: коснуться его цена уже не может. */
  const reachable = hasQuote && quote.knockoutReachable;
  const poolVerdict = hasQuote ? quote.pool : null;
  const poolRejected = Boolean(poolVerdict && !poolVerdict.ok);

  /** Списывается со счёта при открытии: маржа плюс разовый тариф. */
  const charge = hasQuote ? quote.margin + quote.tariff.total : margin;

  /**
   * Цена безубытка: тариф уплачен вперёд, поэтому ноль на графике лежит не на
   * входе, а на столько дальше, сколько движения нужно, чтобы его отбить.
   */
  const breakEven = useMemo(() => {
    if (!hasQuote || quote.size <= 0) return null;
    const shift = quote.tariff.total / quote.size;
    return side === "LONG" ? quote.entryPrice + shift : quote.entryPrice - shift;
  }, [hasQuote, quote, side]);

  /**
   * Доля тарифа от маржи. Все три слагаемых линейны по марже, поэтому доля от
   * суммы не зависит — считаем её один раз на пробной марже в $1.
   */
  const tariffRate = useMemo(() => {
    const probe = quoteLeverage({
      side,
      entryPrice,
      margin: 1,
      leverage,
      lambdaSource: lambda.source,
    });
    return probe.error ? 0 : probe.tariff.total;
  }, [side, entryPrice, leverage, lambda.source]);

  /** «Max» обязан оставить денег на тариф, иначе кнопка сразу отказывает. */
  const maxMargin = cash / (1 + Math.max(0, tariffRate));

  const disabledReason = useMemo(() => {
    if (!tokenId) return "Исход недоступен";
    if (!tradable) return "Торговля закрыта";
    if (!hydrated) return "Загрузка счёта…";
    if (margin <= 0) return "Введите маржу";
    if (quote.errorCode) return ERROR_TEXT[quote.errorCode];
    if (charge > cash + EPS) return "Недостаточно средств";
    if (poolVerdict && !poolVerdict.ok) return POOL_BLOCKED;
    return null;
  }, [tokenId, tradable, hydrated, margin, quote.errorCode, charge, cash, poolVerdict]);

  const chips: AmountChip[] = [
    { label: "+$10", onClick: () => setMarginText(toField(margin + 10)) },
    { label: "+$50", onClick: () => setMarginText(toField(margin + 50)) },
    { label: "+$200", onClick: () => setMarginText(toField(margin + 200)) },
    {
      label: "Max",
      onClick: () => setMarginText(toField(maxMargin)),
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
      leverage,
      entryPrice,
    });

    if (!result.ok) {
      toast.error("Позиция не открыта", translateStoreError(result.error) ?? undefined);
      return;
    }

    toast.success(
      `${side === "LONG" ? "Лонг" : "Шорт"} ${formatLeverage(leverage)} открыт`,
      `Маржа ${formatMoney(margin)} · тариф ${formatMoney(quote.tariff.total)} · ${
        reachable ? `нокаут ${formatCents(quote.knockoutPrice)}` : "нокаут недостижим"
      }`,
    );
    setMarginText("");
  }

  const isLong = side === "LONG";
  const entryTick = priceToTicks(entryPrice);
  /** Цена входа после квантования — по ней считает движок, её и показываем. */
  const tickPrice = ticksToPrice(entryTick);

  // Вырожденный рынок: цена округляется в 0 или 100 тиков, входа в их модели
  // на таком рынке нет вовсе. Пустая форма тут врала бы — показываем причину.
  if (maxLeverage(entryPrice) <= 0) {
    return (
      <div className={cn("space-y-3 p-5 pt-4", className)}>
        <TradeHero
          kicker="Плечо недоступно"
          hint={KNOCKOUT_HINT}
          value={formatCents(entryPrice)}
          tone="muted"
          note={
            <>
              Исход «{outcome.label}» стоит{" "}
              <span className="font-semibold text-text">{entryTick}</span> из 100 тиков — рынок
              фактически определился
            </>
          }
        />
        <Note tone="warn">
          Плечевая позиция живёт между ценой входа и нокаутом, а цена в этой модели ходит целыми
          тиками (1 тик = 1¢). Вход возможен строго между 0 и 100 тиками: на краю диапазона
          ставить нокаут не от чего, и позиция не открывается ни при каком плече.
        </Note>
        <Note>
          Обычная покупка исхода на вкладке «Спот» по-прежнему доступна — ограничение касается
          только плеча.
        </Note>
      </div>
    );
  }

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
            {formatLeverage(leverage)}
          </span>
        </div>

        <input
          type="range"
          min={MIN_LEVERAGE}
          max={MAX_LEVERAGE}
          step={LEVERAGE_STEP}
          value={leverage}
          disabled={!tradable}
          aria-label="Плечо"
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-grid disabled:cursor-not-allowed disabled:opacity-50"
          style={{ accentColor: isLong ? "var(--yes)" : "var(--no)" }}
        />

        <div className="tnum mt-2 flex items-center justify-between text-[10.5px] text-faint">
          <span>{formatLeverage(MIN_LEVERAGE)}</span>
          <span>максимум {formatLeverage(MAX_LEVERAGE)}</span>
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
            // Маржа введена, но движок отказал — молчать об этом нельзя.
            quote.errorCode && quote.errorCode !== "margin" ? (
              <>
                {ERROR_TEXT[quote.errorCode]}: при цене{" "}
                <span className="font-semibold text-text">{formatCents(entryPrice)}</span> и плече{" "}
                {formatLeverage(leverage)} позиция не открывается
              </>
            ) : (
              <>
                Текущая цена исхода{" "}
                <span className="font-semibold text-text">{formatCents(entryPrice)}</span> —
                введите маржу, чтобы увидеть, где сгорит позиция
              </>
            )
          ) : reachable ? (
            <>
              <span className="font-semibold text-no">{formatTicks(quote.barrierTicks)}</span> от
              входа{" "}
              <span className="font-semibold text-text">{formatCents(quote.entryPrice)}</span> —
              столько цена может пройти против вас
            </>
          ) : (
            "На этом плече нокаут лёг на границу диапазона: сгореть позиция не может"
          )
        }
      />

      <MetricList>
        <Metric
          label="Цена входа"
          hint={
            <>
              Плечевая модель считает цену целыми тиками (1 тик = 1¢): рыночные{" "}
              {formatCents(entryPrice)} округляются до {formatCents(tickPrice)}. Именно от этой
              цены отсчитывается нокаут.
            </>
          }
          value={formatCents(tickPrice)}
        />
        <Metric
          label="До нокаута"
          hint={DISTANCE_HINT}
          value={
            hasQuote && reachable
              ? `${formatTicks(quote.barrierTicks)} · ${formatShare(quote.distanceToKnockoutPct)} цены`
              : hasQuote
                ? "недостижим"
                : "—"
          }
          tone={hasQuote && reachable && quote.barrierTicks <= 5 ? "text-no" : undefined}
        />
        <Metric
          label="Экспозиция"
          hint={EXPOSURE_HINT}
          value={hasQuote ? formatMoney(quote.exposure) : "—"}
        />
        <Metric label="Размер позиции" value={hasQuote ? formatCompact(quote.size) : "—"} />
        <Metric
          label="Максимальная выплата"
          hint={PAYOUT_HINT}
          value={hasQuote ? formatMoney(quote.maxPayout) : "—"}
        />
        <Metric
          label="Максимальная прибыль"
          value={hasQuote ? formatMoney(quote.maxProfit) : "—"}
          tone={hasQuote ? "text-yes" : undefined}
        />
        <Metric
          label="Максимальный убыток"
          value={hasQuote ? formatMoney(quote.maxLoss + quote.tariff.total) : "—"}
          strong
          divider
        />
      </MetricList>

      {/* ---------------------------- тариф ---------------------------- */}

      <div className="rounded-[14px] border border-border bg-surface px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex items-center gap-1 text-faint">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.08em]">
              Тариф при открытии
            </span>
            <Hint>{TARIFF_HINT}</Hint>
          </div>
          {/* Откуда взялась гэп-премия. Подставлять чужую калибровку молча
              нельзя: цена риска у рынка своя, и человек должен видеть, по его
              ли данным она посчитана. */}
          <span className="tnum text-[10.5px] leading-none text-faint">
            {lambda.origin === "market"
              ? `риск по истории рынка · ${formatCompact(lambda.steps ?? 0)} шагов`
              : "риск по эталонной калибровке"}
          </span>
        </div>

        <MetricList className="mt-2.5 px-0">
          <Metric
            label="Стоимость капитала"
            hint={CAPITAL_HINT}
            value={hasQuote ? formatMoney(quote.tariff.capitalCost) : "—"}
          />
          <Metric
            label="Гэп-премия"
            hint={GAP_HINT}
            value={hasQuote ? formatMoney(quote.tariff.gapPremium) : "—"}
          />
          <Metric
            label="Комиссия платформы"
            hint={PLATFORM_HINT}
            value={hasQuote ? formatMoney(quote.tariff.platformCost) : "—"}
          />
          <Metric
            label="Итого"
            value={
              hasQuote ? (
                <>
                  {formatMoney(quote.tariff.total)}{" "}
                  <span className="font-normal text-muted">
                    · {formatPct(quote.tariff.totalPct)} маржи
                  </span>
                </>
              ) : (
                "—"
              )
            }
            strong
            divider
          />
        </MetricList>

        {hasQuote && (
          <p className="tnum mt-2.5 border-t border-border pt-2.5 text-[11px] leading-relaxed text-muted">
            Со счёта спишется{" "}
            <span className="font-semibold text-text">{formatMoney(charge)}</span>: маржа{" "}
            {formatMoney(quote.margin)} плюс тариф {formatMoney(quote.tariff.total)}.
          </p>
        )}
      </div>

      {/* ----------------------------- пул ----------------------------- */}

      {hasQuote && poolVerdict && (
        <div
          className={cn(
            "rounded-[14px] border px-3.5 py-3",
            poolVerdict.ok ? "border-border bg-bg-subtle" : "border-no/30 bg-no-soft",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1 text-faint">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.08em]">
                Вердикт пула
              </span>
              <Hint>{POOL_HINT}</Hint>
            </span>
            <Badge tone={poolVerdict.ok ? "yes" : "no"}>
              {poolVerdict.ok ? "Принято" : "Отказ"}
            </Badge>
          </div>

          {poolVerdict.ok ? (
            <p className="tnum mt-2 text-[11.5px] leading-relaxed text-muted">
              Пул резервирует {formatMoney(quote.maxPayout)} под вашу выплату — это умещается в
              лимит {formatMoney(MARKET_CAP, 0)} на один рынок.
            </p>
          ) : (
            <div className="mt-2 space-y-1">
              <p className="text-[12px] font-semibold leading-snug text-no">
                {splitPoolReason(poolVerdict.reason).title}
              </p>
              <p className="tnum text-[11.5px] leading-relaxed text-muted">
                {splitPoolReason(poolVerdict.reason).detail ??
                  `обязательство ${formatMoney(quote.maxPayout)} не помещается в лимит`}
              </p>
              <p className="text-[11.5px] leading-relaxed text-muted">
                Уменьшите маржу или плечо — либо откройте встречную позицию: она гасит перекос
                пула по этому рынку и освобождает лимит.
              </p>
            </div>
          )}
        </div>
      )}

      {hasQuote && (
        <div className="rounded-[14px] border border-border bg-surface px-3 py-3">
          <p className="mb-1 px-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
            Результат при цене исхода
          </p>
          <PayoffChart
            side={side}
            entryPrice={quote.entryPrice}
            knockoutPrice={quote.knockoutPrice}
            breakEvenPrice={breakEven}
            pnlAt={pnlAt}
          />
        </div>
      )}

      {/* ------------------------ предупреждение ----------------------- */}

      {hasQuote && !reachable ? (
        <Note>
          На этом плече нокаут-цена лежит за границей диапазона — коснуться её цена не может.
          Максимум, что вы потеряете, — маржа {formatMoney(margin)} и тариф{" "}
          {formatMoney(quote.tariff.total)}, если исход разрешится против вас.
        </Note>
      ) : (
        <Note tone="warn">
          Если цена коснётся нокаут-цены, позиция гаснет, а маржа
          {hasQuote ? ` ${formatMoney(margin)} ` : " "}
          теряется целиком — вместе с уже уплаченным тарифом. Вернувшаяся обратно цена её не
          восстановит: позиции уже не будет, и восстановить её нельзя. Чем больше плечо, тем
          ближе нокаут к текущей цене.
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
            ? cn(
                "bg-bg-subtle text-muted ring-1 ring-inset ring-border disabled:opacity-100",
                // Отказ пула — не «ещё не заполнено», а решение риск-движка.
                poolRejected && "bg-no-soft text-no ring-no/25",
              )
            : // В тёмной теме изумруд и роза светлые — подпись берёт цвет фона.
              isLong
              ? "bg-yes text-white hover:bg-yes-hover dark:text-bg"
              : "bg-no text-white hover:bg-no-hover dark:text-bg",
        )}
      >
        {disabledReason ?? `Открыть ${isLong ? "лонг" : "шорт"} ${formatLeverage(leverage)}`}
      </Button>
    </div>
  );
}
