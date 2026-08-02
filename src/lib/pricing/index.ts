/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  ТОЧКА ПОДМЕНЫ ТОРГОВОЙ МАТЕМАТИКИ                                   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Весь UI ходит только сюда: `quote(input)` либо `activeEngine.quote(input)`.
 * Никакой другой файл проекта не должен считать цены самостоятельно.
 *
 * ── Как поменять движок ────────────────────────────────────────────────
 * 1. Написать объект, реализующий `PricingEngine` из ./types
 *    (можно в отдельном файле рядом, например ./my-engine.ts).
 * 2. Заменить ОДНУ строку ниже:  `export const activeEngine = myEngine;`
 * 3. Всё. Пересборка UI не требуется — компоненты типизированы на `Quote`.
 *
 * ── Что обязана гарантировать замена ───────────────────────────────────
 * • Чистота: никаких сетевых вызовов, localStorage, React и window.
 *   Функция должна одинаково работать на сервере и на клиенте.
 * • Никогда не бросать исключения. Любая проблема — это `Quote` с
 *   заполненным `error` и нулями во всех числовых полях (см. `emptyQuote`).
 * • Никогда не возвращать NaN/Infinity ни в одном числовом поле.
 * • Поддержать оба режима входа: `amount` (доллары номинала, без комиссии)
 *   и `shares` (количество акций). Если задано и то и другое — приоритет
 *   у `shares`.
 * • Уважать `limitPrice` (0..1): не исполнять хуже лимита; если по лимиту
 *   ничего не исполняется — вернуть `error`.
 * • Комиссия: `fee = cost * feeBps / 10000`; `total` = cost + fee для BUY
 *   и cost - fee для SELL.
 * • Выставлять `partial = true`, когда заявка исполнена не полностью,
 *   и класть фактический объём в `filledShares` (== `shares`).
 * • Цены в диапазоне 0..1, `avgPrice = cost / shares`.
 *
 * Помощники `emptyQuote`, `finalizeQuote`, `roundToTick`, `feeRateFromBps`
 * из ./types доступны для повторного использования, но не обязательны.
 */

import { orderBookEngine } from "./orderbook-engine";
import { safeNum, type Quote, type QuoteInput } from "./types";

export type {
  FinalizeArgs,
  PricingEngine,
  Quote,
  QuoteInput,
  QuoteLevel,
  Side,
} from "./types";

export {
  clampPrice,
  emptyQuote,
  feeRateFromBps,
  finalizeQuote,
  normalizeTick,
  roundToTick,
  safeNum,
  SHARE_EPS,
} from "./types";

export { orderBookEngine } from "./orderbook-engine";

/**
 * Маркет-мейкер Хэнсона — порт бэкенда (services/robot/lmsr.py). Это не
 * `PricingEngine`: у него своя, более узкая роль — робот-маркетмейкер,
 * который держит цену на пустом рынке.
 */
export { LMSR, PRICE_CEIL, PRICE_FLOOR, type LmsrOutcome } from "./lmsr";

/* ------------------------------------------------------------------ */
/* Плечевой слой — порт services/leverage/*                            */
/* ------------------------------------------------------------------ */

/** Тиковая модель: цена 0..1 ⇄ целые тики 0..100. */
export {
  clampTicks,
  isEntryTick,
  ONE,
  priceToTicks,
  roundHalfEven,
  TICK_SIZE,
  ticksToPrice,
} from "./ticks";

/** Ядро нокаута: те же формулы, что в knockout.py. */
export {
  isKnockedOut,
  LeverageError,
  LONG,
  MAX_LEVERAGE,
  MIN_LEVERAGE_EXCLUSIVE,
  openPosition,
  SHORT,
  type Direction,
  type LeverageErrorCode,
  type OpenPositionArgs,
  type Position,
} from "./knockout";

/** λ/J: шов под калибровку, сегодня — статическая таблица живого рынка. */
export {
  LAMBDA_J_TABLE,
  StaticLambdaJSource,
  staticLambdaJSource,
  type LambdaJ,
  type LambdaJSource,
} from "./lambda-source";

/** Тариф: капитал + гэп-премия + маржа платформы. */
export {
  barrierTicks,
  DEFAULT_TARIFF,
  EMPTY_TARIFF,
  pricePosition,
  roundTariff,
  type TariffBreakdown,
  type TariffConfig,
} from "./tariff";

/** Лимиты пула в терминах максимальной выплаты, с неттингом лонг/шорт. */
export {
  DEFAULT_POOL_SHARES,
  Exposure,
  poolLimits,
  PoolRiskEngine,
  type PoolLimits,
  type PoolVerdict,
} from "./pool-risk";

/** Фасад для UI: котировка плечевой позиции и переоценка открытой. */
export {
  emptyLeverageQuote,
  isKnockedOutAtPrice,
  knockoutPriceFor,
  LEVERAGE_DEFAULTS,
  leveragePnlAt,
  maxLeverage,
  quoteLeverage,
  type KnockoutArgs,
  type LeverageConfig,
  type LeveragePnlArgs,
  type LeverageQuote,
  type LeverageQuoteErrorCode,
  type LeverageQuoteInput,
  type LeverageSide,
} from "./leverage";

/** ⬇⬇⬇ ЕДИНСТВЕННАЯ СТРОКА, КОТОРУЮ НУЖНО ПОМЕНЯТЬ ПРИ ЗАМЕНЕ МАТЕМАТИКИ. */
export const activeEngine = orderBookEngine;

/** Комиссия площадки по умолчанию, в базисных пунктах (у Polymarket — 0). */
export const DEFAULT_FEE_BPS = 0;

/** Котировка через активный движок. Основной вход для всего UI. */
export function quote(input: QuoteInput): Quote {
  return activeEngine.quote(input);
}

/**
 * Во сколько раз вырастут деньги, если исход по цене `price` выиграет.
 * 0.62 → 1.61x. Некорректная цена → 0.
 */
export function estimateReturn(price: number): number {
  const p = safeNum(price, 0);
  if (p <= 0 || p > 1) return 0;
  return 1 / p;
}
