/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  ФАСАД ПЛЕЧЕВОЙ («ТУРБО») МАТЕМАТИКИ                                 ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Своей математики здесь больше НЕТ. Файл только переводит вход из формата
 * Polymarket (цена — доля 0..1) в тиковую модель бэкенда и складывает ответ
 * из готовых кубиков:
 *
 *   ./ticks         — цена 0..1 ⇄ целые тики 0..100
 *   ./knockout      — уровень нокаута, размер позиции, макс. убыток и выплата
 *   ./tariff        — стоимость капитала + гэп-премия + маржа платформы
 *   ./lambda-source — λ/J с калибровки живого рынка
 *   ./pool-risk     — лимиты пула (необязательная проверка)
 *
 * ── Модель продукта ────────────────────────────────────────────────────
 * Токен вероятности живёт в [0,1], поэтому максимальный убыток конечен и
 * известен заранее. Игрок вносит маржу, равную этому убытку, и дальше:
 *   • ликвидаций и margin call НЕТ, долг невозможен в принципе;
 *   • вместо ликвидации — НОКАУТ: тик, на котором маржа исчерпана и позиция
 *     гаснет. Теряется ровно маржа (плюс уплаченный вперёд тариф).
 *
 *     LONG:  dist = p0/L; ko = p0 − dist; size = margin·L/p0;       payout = size·(1−p0)
 *     SHORT: dist = (1−p0)/L; ko = p0 + dist; size = margin·L/(1−p0); payout = size·p0
 *
 * Плечо строго в (1, 5]: MAX_LEVERAGE их модели авторитетен. Динамического
 * потолка по сроку и краю диапазона у них нет — прежний здешний не пережил
 * сверку с их кодом.
 *
 * ── Что гарантирует этот файл ──────────────────────────────────────────
 * • Чистота: ни сети, ни React, ни window, ни часов — одинаково работает на
 *   сервере и на клиенте.
 * • `quoteLeverage` не бросает исключений: любая проблема — котировка с
 *   `error`/`errorCode` и нулями во всех числовых полях.
 * • Ни одного NaN/Infinity в числовых полях.
 * • `LeverageQuote` содержит функцию `pnlAt` и потому НЕ сериализуется — в
 *   localStorage кладут поля позиции, а не котировку целиком.
 */

import {
  isKnockedOut,
  LeverageError,
  MAX_LEVERAGE,
  MIN_LEVERAGE_EXCLUSIVE,
  openPosition,
  type Direction,
  type LeverageErrorCode,
  type Position,
} from "./knockout";
import { staticLambdaJSource, type LambdaJSource } from "./lambda-source";
import type { PoolRiskEngine, PoolVerdict } from "./pool-risk";
import {
  barrierTicks,
  DEFAULT_TARIFF,
  EMPTY_TARIFF,
  pricePosition,
  type TariffBreakdown,
  type TariffConfig,
} from "./tariff";
import { isEntryTick, ONE, priceToTicks, ticksToPrice } from "./ticks";
import { safeNum } from "./types";

/** Сторона позиции. Совпадает с `Direction` бэкенда. */
export type LeverageSide = Direction;

/** Код причины отказа: коды бэкенда плюс вырожденная цена Polymarket. */
export type LeverageQuoteErrorCode = LeverageErrorCode | "market_decided";

/** Тексты ошибок. UI переводит их по `errorCode`, а не по строке. */
const MESSAGES: Record<LeverageQuoteErrorCode, string> = {
  direction: "Invalid direction",
  leverage_range: `Leverage must be above ${MIN_LEVERAGE_EXCLUSIVE}x and at most ${MAX_LEVERAGE}x`,
  entry_range: "Invalid entry price",
  margin: "Enter a margin",
  knockout_equals_entry: "Leverage is too high for this entry price",
  market_decided: "Market has effectively resolved",
};

export interface LeverageConfig extends TariffConfig {
  /** Потолок плеча их модели. */
  maxLeverage: number;
  /** Нижняя граница ИСКЛЮЧИТЕЛЬНАЯ: ровно 1x не принимается. */
  minLeverageExclusive: number;
}

export const LEVERAGE_DEFAULTS: LeverageConfig = {
  ...DEFAULT_TARIFF,
  maxLeverage: MAX_LEVERAGE,
  minLeverageExclusive: MIN_LEVERAGE_EXCLUSIVE,
};

export interface LeverageQuoteInput {
  side: LeverageSide;
  /** Цена входа как приходит с Polymarket: доля 0..1. Округляется к тику. */
  entryPrice: number;
  margin: number;
  leverage: number;
  /** id рынка — нужен только риск-движку пула. */
  marketId?: string;
  /** Параметры тарифа; по умолчанию LEVERAGE_DEFAULTS. */
  tariff?: TariffConfig;
  /** Источник λ/J; по умолчанию статическая калибровка Bitcoin-рынка. */
  lambdaSource?: LambdaJSource;
  /** Если передан — в котировке будет вердикт пула. Состояние не меняется. */
  pool?: PoolRiskEngine;
}

export interface LeverageQuote {
  side: LeverageSide;
  margin: number;
  leverage: number;
  /** Цена входа ПОСЛЕ округления к тику: 0.734 → 73 тика → 0.73. */
  entryPrice: number;
  entryTick: number;
  knockoutPrice: number;
  knockoutTick: number;
  /** Барьер |вход − нокаут| в тиках — по нему выбирается λ/J. */
  barrierTicks: number;
  /** Расстояние до нокаута в долях цены (0.08 = 8 п.п. вероятности). */
  distanceToKnockout: number;
  /** То же расстояние в долях от цены входа. */
  distanceToKnockoutPct: number;
  /** false, если нокаут лёг на границу диапазона и сработает лишь при резолюции. */
  knockoutReachable: boolean;
  /** Размер позиции в юнитах — их `size`. */
  size: number;
  /** Тот же размер под именем, которым его зовут UI и стор. */
  tokens: number;
  /** Номинал позиции: маржа × плечо (== size × цена входа). */
  exposure: number;
  /** Максимальный убыток игрока. По построению равен марже. */
  maxLoss: number;
  /** Обязательство пула по этой позиции. */
  maxPayout: number;
  /** Разбор тарифа: капитал + гэп-премия + платформа. */
  tariff: TariffBreakdown;
  /** Лучший исход за вычетом тарифа. */
  maxProfit: number;
  /** Вердикт риск-движка пула; null, если движок не передан. */
  pool: PoolVerdict | null;
  /** Позиция бэкенда — её принимает PoolRiskEngine.accept(). */
  position: Position | null;
  /** P&L при произвольной цене 0..1 — для графика выплаты. */
  pnlAt(price: number): number;
  error: string | null;
  errorCode: LeverageQuoteErrorCode | null;
}

const MONEY_EPS = 1e-9;

/** Пустая котировка: нули, текст ошибки и нулевой P&L. Никогда не NaN. */
export function emptyLeverageQuote(
  side: LeverageSide,
  errorCode: LeverageQuoteErrorCode | null,
): LeverageQuote {
  return {
    side,
    margin: 0,
    leverage: 0,
    entryPrice: 0,
    entryTick: 0,
    knockoutPrice: 0,
    knockoutTick: 0,
    barrierTicks: 0,
    distanceToKnockout: 0,
    distanceToKnockoutPct: 0,
    knockoutReachable: false,
    size: 0,
    tokens: 0,
    exposure: 0,
    maxLoss: 0,
    maxPayout: 0,
    tariff: EMPTY_TARIFF,
    maxProfit: 0,
    pool: null,
    position: null,
    pnlAt: () => 0,
    error: errorCode ? MESSAGES[errorCode] : null,
    errorCode,
  };
}

/* ------------------------------------------------------------------ */
/* Котировка                                                           */
/* ------------------------------------------------------------------ */

export function quoteLeverage(input: LeverageQuoteInput): LeverageQuote {
  const side: LeverageSide = input?.side === "SHORT" ? "SHORT" : "LONG";

  const margin = safeNum(input?.margin, 0);
  const rawPrice = safeNum(input?.entryPrice, 0);
  const leverage = safeNum(input?.leverage, 0);

  // Порядок проверок — от «пользователь ещё вводит» к «так нельзя вообще».
  if (!(margin > MONEY_EPS)) return emptyLeverageQuote(side, "margin");
  if (!(rawPrice > 0 && rawPrice < 1)) return emptyLeverageQuote(side, "entry_range");

  const entryTick = priceToTicks(rawPrice);
  // 0.9995 → 100 тиков: входа с таким тиком в их модели не существует.
  if (!isEntryTick(entryTick)) return emptyLeverageQuote(side, "market_decided");

  let position: Position;
  try {
    position = openPosition({
      direction: side,
      marketId: input?.marketId ?? "",
      entry: entryTick,
      leverage,
      margin,
    });
  } catch (err) {
    if (err instanceof LeverageError) return emptyLeverageQuote(side, err.code);
    throw err;
  }

  const tariff = pricePosition(
    position,
    input?.lambdaSource ?? staticLambdaJSource,
    input?.tariff ?? LEVERAGE_DEFAULTS,
  );
  const entryPrice = ticksToPrice(position.entry);
  const knockoutPrice = ticksToPrice(position.knockout);
  const distanceToKnockout = Math.abs(entryPrice - knockoutPrice);
  const costs = tariff.total;

  return {
    side,
    margin: position.margin,
    leverage: position.leverage,
    entryPrice,
    entryTick: position.entry,
    knockoutPrice,
    knockoutTick: position.knockout,
    barrierTicks: barrierTicks(position),
    distanceToKnockout,
    distanceToKnockoutPct: distanceToKnockout / entryPrice,
    knockoutReachable: position.knockout > 0 && position.knockout < ONE,
    size: position.size,
    tokens: position.size,
    exposure: position.margin * position.leverage,
    maxLoss: position.maxLoss,
    maxPayout: position.maxPayout,
    tariff,
    maxProfit: position.maxPayout - costs,
    pool: input?.pool ? input.pool.canAccept(position) : null,
    position,
    pnlAt: (price: number): number =>
      leveragePnlAt({
        side,
        tokens: position.size,
        entryPrice,
        margin: position.margin,
        knockoutPrice,
        price,
        costs,
      }),
    error: null,
    errorCode: null,
  };
}

/* ------------------------------------------------------------------ */
/* Переоценка                                                          */
/* ------------------------------------------------------------------ */

export interface LeveragePnlArgs {
  side: LeverageSide;
  /** Размер позиции в юнитах (их `size`). */
  tokens: number;
  entryPrice: number;
  margin: number;
  knockoutPrice: number;
  /** Текущая цена 0..1. */
  price: number;
  /** Уже уплаченный тариф; по умолчанию 0. */
  costs?: number;
}

/**
 * P&L позиции при цене `price`. За нокаутом результат ровно −(маржа + тариф):
 * позиция сгорела, и вернувшаяся обратно цена её не восстановит. Ниже этого
 * значение не опускается никогда — долга в продукте нет.
 *
 * Сравнение с нокаутом здесь идёт в долях цены, а не в тиках: график выплаты
 * рисуется по непрерывной сетке. На узлах тиковой сетки результат совпадает с
 * `isKnockedOut` бэкенда.
 */
export function leveragePnlAt(args: LeveragePnlArgs): number {
  const side: LeverageSide = args?.side === "SHORT" ? "SHORT" : "LONG";
  const margin = Math.max(0, safeNum(args?.margin, 0));
  const size = Math.max(0, safeNum(args?.tokens, 0));
  const entryPrice = clamp01(safeNum(args?.entryPrice, 0));
  const knockoutPrice = clamp01(safeNum(args?.knockoutPrice, side === "LONG" ? 0 : 1));
  const costs = Math.max(0, safeNum(args?.costs, 0));
  const price = clamp01(safeNum(args?.price, entryPrice));

  if (margin <= MONEY_EPS || size <= 0 || entryPrice <= 0) return 0;

  const floor = -(margin + costs);
  const burned = side === "LONG" ? price <= knockoutPrice : price >= knockoutPrice;
  if (burned) return floor;

  const move = side === "LONG" ? price - entryPrice : entryPrice - price;
  return Math.max(floor, safeNum(size * move - costs, 0));
}

/** Сгорела ли позиция при цене 0..1 — целочисленная проверка их модели. */
export function isKnockedOutAtPrice(position: Position, price: number): boolean {
  return isKnockedOut(position, priceToTicks(safeNum(price, 0)));
}

/* ------------------------------------------------------------------ */
/* Вспомогательное для UI                                              */
/* ------------------------------------------------------------------ */

export interface KnockoutArgs {
  side: LeverageSide;
  /** Цена входа 0..1. */
  entryPrice: number;
  leverage: number;
}

/**
 * Цена нокаута 0..1 для готовых параметров или null, если позиция невозможна
 * (вырожденная цена, плечо вне (1, 5], нокаут совпал со входом).
 */
export function knockoutPriceFor({ side, entryPrice, leverage }: KnockoutArgs): number | null {
  const quote = quoteLeverage({ side, entryPrice, leverage, margin: 1 });
  return quote.error ? null : quote.knockoutPrice;
}

/**
 * Максимальное плечо для входа по цене `price`.
 * У их модели потолок один и не зависит ни от срока, ни от края диапазона:
 * MAX_LEVERAGE. Возвращает 0, если плечо на этой цене недоступно вовсе —
 * цена округлилась в 0 или 100 тиков, рынок фактически определился.
 */
export function maxLeverage(price: number): number {
  const p = safeNum(price, 0);
  if (!(p > 0 && p < 1)) return 0;
  return isEntryTick(priceToTicks(p)) ? MAX_LEVERAGE : 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
