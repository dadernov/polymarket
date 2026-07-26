/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  ТОЧКА ПОДМЕНЫ МАТЕМАТИКИ ПЛЕЧЕВЫХ («ТУРБО») ПОЗИЦИЙ                 ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Весь UI плечевой торговли ходит только сюда: `quoteLeverage(input)` — тикет
 * открытия, `maxLeverage({ price, endDate })` — верхняя граница слайдера,
 * `leveragePnlAt(args)` — переоценка уже открытой позиции (её использует
 * src/lib/store/leverage.ts). Никакой другой файл не считает нокаут сам.
 *
 * ── Модель продукта ────────────────────────────────────────────────────
 * Токен вероятности живёт в [0,1], поэтому максимальный убыток позиции
 * конечен и известен заранее. Пользователь вносит маржу, равную этому
 * убытку, и дальше:
 *   • ликвидаций и margin call НЕТ, долг невозможен в принципе;
 *   • вместо ликвидации — НОКАУТ: цена, на которой маржа исчерпана и
 *     позиция сгорает. Теряется ровно внесённое, не больше.
 *
 *     экспозиция = маржа × плечо
 *     количество = экспозиция / цена_входа
 *     нокаут LONG  = цена_входа × (1 − 1/плечо) + буфер
 *     нокаут SHORT = цена_входа × (1 + 1/плечо) − буфер
 *
 * Буфер (по умолчанию 1 тик) ставит нокаут чуть РАНЬШЕ точки полного
 * обнуления: зазор между «сгорело» и реальным остатком — источник покрытия
 * издержек закрытия. Доход площадки — спред при открытии (bps от экспозиции)
 * и ежедневная комиссия за финансирование на заёмную часть (экспозиция −
 * маржа).
 *
 * ── Как поменять математику ────────────────────────────────────────────
 * Переписать `quoteLeverage` / `maxLeverage` прямо здесь. Типы наружу
 * менять не нужно: UI и стор типизированы на `LeverageQuote`, поля позиции
 * складываются из полей котировки.
 *
 * ── Что обязана гарантировать замена ───────────────────────────────────
 * • Чистота: ни сети, ни React, ни window/localStorage — файл обязан
 *   одинаково работать на сервере и на клиенте. Единственное обращение к
 *   часам — `Date.now()` в `maxLeverage`, и его можно подменить через `now`.
 * • Никогда не бросать исключения: любая проблема — котировка с заполненным
 *   `error` и нулями во всех числовых полях (см. `emptyLeverageQuote`).
 * • Никогда не возвращать NaN/Infinity ни в одном числовом поле.
 * • `pnlAt(price)` никогда не хуже −margin: долг невозможен ни при какой цене.
 * • Нокаут строго по правильную сторону от входа (ниже для LONG, выше для
 *   SHORT). Для SHORT он может оказаться выше 1 — это законно и значит, что
 *   позиция не сгорает никогда: маржа покрывает весь остаток диапазона
 *   (см. `knockoutReachable`).
 * • `LeverageQuote` содержит функцию `pnlAt` и потому НЕ сериализуется — в
 *   localStorage кладут поля позиции, а не котировку целиком.
 */

import { clampPrice, feeRateFromBps, normalizeTick, safeNum } from "./types";

export type LeverageSide = "LONG" | "SHORT";

export interface LeverageConfig {
  /** Спред площадки при открытии, в bps от экспозиции. */
  spreadBps: number;
  /** Комиссия за финансирование в день, в bps от заёмной части. */
  fundingBpsPerDay: number;
  /** На сколько тиков нокаут ставится раньше точки полного обнуления. */
  knockoutBufferTicks: number;
  /** Жёсткий потолок плеча; фактический предел считает `maxLeverage`. */
  maxLeverage: number;
}

export const LEVERAGE_DEFAULTS: LeverageConfig = {
  spreadBps: 50,
  fundingBpsPerDay: 20,
  knockoutBufferTicks: 1,
  maxLeverage: 20,
};

export interface LeverageQuoteInput {
  side: LeverageSide;
  entryPrice: number;
  margin: number;
  leverage: number;
  tickSize: number;
  spreadBps: number;
  fundingBpsPerDay: number;
  /** Буфер нокаута в тиках; по умолчанию `LEVERAGE_DEFAULTS.knockoutBufferTicks`. */
  knockoutBufferTicks?: number;
}

export interface LeverageQuote {
  side: LeverageSide;
  margin: number;
  leverage: number;
  entryPrice: number;
  exposure: number;
  tokens: number;
  knockoutPrice: number;
  /**
   * Насколько цена может пройти против позиции до нокаута — в долях цены
   * (0.08), они же процентные пункты вероятности после ×100 (8 п.п.).
   */
  distanceToKnockout: number;
  /** То же расстояние в долях от цены входа: ≈ 1/плечо. */
  distanceToKnockoutPct: number;
  /** false, если нокаут лежит вне [0,1] и потому недостижим. */
  knockoutReachable: boolean;
  /** Заёмная часть экспозиции: exposure − margin. */
  borrowed: number;
  spreadCost: number;
  fundingPerDay: number;
  /** Лучший исход в пределах диапазона цен, за вычетом спреда. */
  maxProfit: number;
  /** P&L при произвольной цене — для графика выплаты. */
  pnlAt(price: number): number;
  error: string | null;
}

/* ------------------------------------------------------------------ */
/* Константы формул                                                    */
/* ------------------------------------------------------------------ */

const MONEY_EPS = 1e-9;
const DAY_MS = 86_400_000;
/** Горизонт, начиная с которого время перестаёт резать плечо. */
const FULL_TIME_DAYS = 30;
/** Коридор до нокаута не должен быть уже стольких тиков. */
const MIN_KNOCKOUT_TICKS = 3;

/* ------------------------------------------------------------------ */
/* Котировка                                                           */
/* ------------------------------------------------------------------ */

/** Пустая котировка: нули, текст ошибки и нулевой P&L. Никогда не NaN. */
export function emptyLeverageQuote(side: LeverageSide, error: string | null): LeverageQuote {
  return {
    side,
    margin: 0,
    leverage: 0,
    entryPrice: 0,
    exposure: 0,
    tokens: 0,
    knockoutPrice: 0,
    distanceToKnockout: 0,
    distanceToKnockoutPct: 0,
    knockoutReachable: false,
    borrowed: 0,
    spreadCost: 0,
    fundingPerDay: 0,
    maxProfit: 0,
    pnlAt: () => 0,
    error,
  };
}

export interface KnockoutArgs {
  side: LeverageSide;
  entryPrice: number;
  leverage: number;
  tickSize: number;
  /** По умолчанию `LEVERAGE_DEFAULTS.knockoutBufferTicks`. */
  bufferTicks?: number;
}

/**
 * Цена, на которой маржа исчерпана. Буфер сдвигает её навстречу позиции,
 * то есть срабатывание происходит чуть раньше полного обнуления.
 * Результат не опускается ниже 0, но для шорта может выйти за 1.
 */
export function knockoutPriceFor({
  side,
  entryPrice,
  leverage,
  tickSize,
  bufferTicks,
}: KnockoutArgs): number {
  const price = safeNum(entryPrice, 0);
  const lev = safeNum(leverage, 0);
  if (!(price > 0) || !(lev >= 1)) return 0;

  const tick = normalizeTick(tickSize);
  const ticks = Math.max(0, safeNum(bufferTicks ?? LEVERAGE_DEFAULTS.knockoutBufferTicks, 0));
  const buffer = ticks * tick;
  // Расстояние до обнуления одинаково в обе стороны: цена входа / плечо.
  const room = price / lev;

  const raw = side === "SHORT" ? price + room - buffer : price - room + buffer;
  return Math.max(0, safeNum(raw, 0));
}

export function quoteLeverage(input: LeverageQuoteInput): LeverageQuote {
  const side: LeverageSide = input?.side === "SHORT" ? "SHORT" : "LONG";

  const margin = safeNum(input?.margin, 0);
  const entryPrice = safeNum(input?.entryPrice, 0);
  const leverage = safeNum(input?.leverage, 0);
  const tick = normalizeTick(input?.tickSize);

  if (!(margin > MONEY_EPS)) return emptyLeverageQuote(side, "Enter a margin");
  if (!(entryPrice > 0 && entryPrice < 1)) return emptyLeverageQuote(side, "Invalid entry price");
  if (!(leverage >= 1)) return emptyLeverageQuote(side, "Leverage must be at least 1x");
  if (leverage > LEVERAGE_DEFAULTS.maxLeverage) {
    return emptyLeverageQuote(side, `Leverage above ${LEVERAGE_DEFAULTS.maxLeverage}x`);
  }

  const exposure = margin * leverage;
  const tokens = exposure / entryPrice;
  if (!(tokens > 0) || !Number.isFinite(exposure)) {
    return emptyLeverageQuote(side, "Position is too large");
  }

  const knockoutPrice = knockoutPriceFor({
    side,
    entryPrice,
    leverage,
    tickSize: tick,
    bufferTicks: input?.knockoutBufferTicks,
  });
  const wrongSide = side === "LONG" ? knockoutPrice >= entryPrice : knockoutPrice <= entryPrice;
  if (wrongSide) return emptyLeverageQuote(side, "Knockout is too close to the entry price");

  const borrowed = Math.max(0, exposure - margin);
  const spreadCost = exposure * feeRateFromBps(input?.spreadBps);
  const fundingPerDay = borrowed * feeRateFromBps(input?.fundingBpsPerDay);

  const distanceToKnockout = Math.abs(entryPrice - knockoutPrice);
  // Шорт с малым плечом: нокаут выше 1, значит маржа покрывает весь диапазон.
  const knockoutReachable = knockoutPrice > 0 && knockoutPrice < 1;

  // Лучший исход в пределах [0,1]: для лонга цена уходит в 1, для шорта в 0.
  const bestMove = side === "LONG" ? 1 - entryPrice : entryPrice;
  const maxProfit = tokens * bestMove - spreadCost;

  const pnlAt = (price: number): number =>
    leveragePnlAt({
      side,
      tokens,
      entryPrice,
      margin,
      knockoutPrice,
      price,
      costs: spreadCost,
    });

  return {
    side,
    margin,
    leverage,
    entryPrice,
    exposure,
    tokens,
    knockoutPrice,
    distanceToKnockout,
    distanceToKnockoutPct: distanceToKnockout / entryPrice,
    knockoutReachable,
    borrowed,
    spreadCost,
    fundingPerDay,
    maxProfit: safeNum(maxProfit, 0),
    pnlAt,
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/* Переоценка                                                          */
/* ------------------------------------------------------------------ */

export interface LeveragePnlArgs {
  side: LeverageSide;
  tokens: number;
  entryPrice: number;
  margin: number;
  knockoutPrice: number;
  /** Текущая цена 0..1. */
  price: number;
  /** Уже понесённые издержки (спред); по умолчанию 0. */
  costs?: number;
}

/**
 * P&L позиции при цене `price`. За нокаутом результат ровно −margin: позиция
 * сгорела. Ниже −margin не опускается никогда — долга в продукте нет.
 */
export function leveragePnlAt(args: LeveragePnlArgs): number {
  const side: LeverageSide = args?.side === "SHORT" ? "SHORT" : "LONG";
  const margin = Math.max(0, safeNum(args?.margin, 0));
  const tokens = Math.max(0, safeNum(args?.tokens, 0));
  const entryPrice = clampPrice(safeNum(args?.entryPrice, 0));
  const knockoutPrice = Math.max(0, safeNum(args?.knockoutPrice, side === "LONG" ? 0 : 1));
  const costs = Math.max(0, safeNum(args?.costs, 0));
  const price = clampPrice(safeNum(args?.price, entryPrice));

  if (margin <= MONEY_EPS || tokens <= 0 || entryPrice <= 0) return 0;

  const burned = side === "LONG" ? price <= knockoutPrice : price >= knockoutPrice;
  if (burned) return -margin;

  const move = side === "LONG" ? price - entryPrice : entryPrice - price;
  return Math.max(-margin, safeNum(tokens * move - costs, 0));
}

/* ------------------------------------------------------------------ */
/* Допустимое плечо                                                    */
/* ------------------------------------------------------------------ */

export interface MaxLeverageArgs {
  /** Цена входа 0..1. */
  price: number;
  /** ISO-дата резолюции события; null — считаем, что до неё далеко. */
  endDate: string | null;
  /** Шаг цены рынка, по умолчанию цент. */
  tickSize?: number;
  /** Точка отсчёта времени; по умолчанию Date.now(). */
  now?: number;
}

/**
 * Максимальное плечо для конкретного входа. Берём минимум из трёх ограничений
 * (каждое режет по своей причине) и округляем вниз до целого:
 *
 *   1. КРАЙ ДИАПАЗОНА. Возле 0 и 1 цена ходит рывками, а резолюция мгновенно
 *      сносит её в край, поэтому лимит падает как √(расстояние до края):
 *      на 50¢ — полный потолок, на 5¢ и 95¢ — примерно треть от него.
 *   2. ВРЕМЯ ДО РЕЗОЛЮЦИИ. За 30+ дней множитель 1, ближе — √(дней/30);
 *      после даты резолюции плечо недоступно вовсе.
 *   3. ШИРИНА КОРИДОРА. Расстояние до нокаута равно цена/плечо; оно обязано
 *      быть не уже трёх тиков, иначе позицию сжигает один случайный принт.
 */
export function maxLeverage(args: MaxLeverageArgs): number {
  const cap = Math.max(1, safeNum(LEVERAGE_DEFAULTS.maxLeverage, 1));
  const price = clampPrice(safeNum(args?.price, 0));
  if (!(price > 0 && price < 1)) return 1;

  const tick = normalizeTick(args?.tickSize ?? 0.01);
  const edge = Math.min(price, 1 - price);

  const edgeCap = cap * Math.sqrt(edge / 0.5);
  const timeCap = cap * timeFactor(args?.endDate, args?.now);
  const tickCap = price / (MIN_KNOCKOUT_TICKS * tick);

  const raw = Math.min(cap, edgeCap, timeCap, tickCap);
  return Math.max(1, Math.floor(safeNum(raw, 1)));
}

/** Множитель 0..1 от срока до резолюции. 0 — событие уже должно было решиться. */
function timeFactor(endDate: string | null | undefined, now?: number): number {
  if (!endDate) return 1;
  const end = Date.parse(endDate);
  if (!Number.isFinite(end)) return 1;

  const base = typeof now === "number" && Number.isFinite(now) ? now : Date.now();
  const days = (end - base) / DAY_MS;
  if (!(days > 0)) return 0;
  return Math.min(1, Math.sqrt(days / FULL_TIME_DAYS));
}
