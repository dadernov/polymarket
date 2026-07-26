/**
 * Альтернативный движок: маркет-мейкер Хэнсона (LMSR).
 *
 *   cost(q) = b * ln( Σ exp(q_i / b) )
 *   price_i = softmax(q / b)
 *
 * Стакан не используется — цена целиком определяется вектором выпущенных
 * акций `q` и параметром ликвидности `b`. Оставлен как рабочий пример того,
 * что подмена движка не требует правок в UI: см. src/lib/pricing/index.ts.
 *
 * Цены здесь непрерывные, поэтому tickSize на расчёт не влияет — только на
 * то, как результат потом отформатируют.
 */

import {
  clampPrice,
  emptyQuote,
  feeRateFromBps,
  finalizeQuote,
  safeNum,
  SHARE_EPS,
  type PricingEngine,
  type Quote,
  type QuoteInput,
  type QuoteLevel,
} from "./types";

export interface LmsrConfig {
  /** Параметр ликвидности b > 0: чем больше, тем меньше проскальзывание. */
  b: number;
  /** Вектор выпущенных акций по исходам. */
  shares: number[];
  /** tokenId по индексам исходов — чтобы понять, какой исход торгуется. */
  tokenIds?: (string | null)[];
  /** Индекс исхода, если tokenIds не заданы или не совпали. */
  outcomeIndex?: number;
}

const MONEY_EPS = 1e-6;
/** На сколько кусков режем сделку, чтобы показать «уровни» исполнения. */
const CHUNKS = 6;
const BISECTION_STEPS = 80;
const MAX_SHARES = 1e9;

/** log(Σ exp(x)) со сдвигом на максимум — иначе exp переполняется. */
function logSumExp(xs: number[]): number {
  let max = -Infinity;
  for (const x of xs) if (x > max) max = x;
  if (!Number.isFinite(max)) return 0;
  let sum = 0;
  for (const x of xs) sum += Math.exp(x - max);
  return sum > 0 ? max + Math.log(sum) : max;
}

function costOf(q: number[], b: number): number {
  return b * logSumExp(q.map((v) => v / b));
}

function priceOf(q: number[], b: number, index: number): number {
  const scaled = q.map((v) => v / b);
  const norm = logSumExp(scaled);
  return clampPrice(Math.exp(scaled[index] - norm));
}

/** Наибольшее n в [0, hi], при котором predicate(n) ещё истинно. */
function largestFeasible(hi: number, predicate: (n: number) => boolean): number {
  if (!predicate(0)) return 0;
  if (predicate(hi)) return hi;
  let lo = 0;
  let high = hi;
  for (let i = 0; i < BISECTION_STEPS; i += 1) {
    const mid = (lo + high) / 2;
    if (predicate(mid)) lo = mid;
    else high = mid;
  }
  return lo;
}

export function createLmsrEngine(config: LmsrConfig): PricingEngine {
  const b = safeNum(config?.b, 0);
  const base = Array.isArray(config?.shares) ? config.shares.map((v) => safeNum(v, 0)) : [];

  return {
    name: "lmsr",

    quote(input: QuoteInput): Quote {
      const side = input?.side === "SELL" ? "SELL" : "BUY";
      const feeRate = feeRateFromBps(input?.feeBps);

      if (!(b > 0) || base.length === 0) {
        return emptyQuote(side, "LMSR is not configured");
      }

      // Какой исход торгуем: сначала по tokenId, иначе по явному индексу.
      let index = safeNum(config.outcomeIndex, 0);
      const tokenIds = config.tokenIds;
      if (Array.isArray(tokenIds) && input?.book?.tokenId) {
        const found = tokenIds.indexOf(input.book.tokenId);
        if (found >= 0) index = found;
      }
      index = Math.floor(index);
      if (index < 0 || index >= base.length) {
        return emptyQuote(side, "Unknown outcome for LMSR");
      }

      const wantShares = safeNum(input?.shares, 0);
      const wantAmount = safeNum(input?.amount, 0);
      const byShares = wantShares > SHARE_EPS;
      if (!byShares && wantAmount <= MONEY_EPS) {
        return emptyQuote(side, "Enter an amount");
      }

      const startCost = costOf(base, b);
      const startPrice = priceOf(base, b, index);
      const sign = side === "BUY" ? 1 : -1;

      const shifted = (n: number): number[] => {
        const next = base.slice();
        next[index] = next[index] + sign * n;
        return next;
      };
      /** Деньги за n акций: для BUY — расход, для SELL — выручка. */
      const notionalFor = (n: number): number => {
        if (n <= 0) return 0;
        const delta = costOf(shifted(n), b) - startCost;
        return Math.max(0, sign * delta);
      };
      const marginalAfter = (n: number): number => priceOf(shifted(n), b, index);

      let target: number;
      let partial = false;

      if (byShares) {
        target = Math.min(wantShares, MAX_SHARES);
        partial = target < wantShares - SHARE_EPS;
      } else {
        // Ищем n, при котором notional достигает запрошенной суммы.
        let hi = Math.min(MAX_SHARES, wantAmount / Math.max(startPrice, 1e-6));
        let steps = 0;
        while (notionalFor(hi) < wantAmount - MONEY_EPS && hi < MAX_SHARES && steps < 40) {
          hi = Math.min(MAX_SHARES, hi * 2);
          steps += 1;
        }
        if (notionalFor(hi) < wantAmount - MONEY_EPS) {
          // Кривая насытилась: больше денег из этого исхода не достать.
          target = hi;
          partial = true;
        } else {
          target = largestFeasible(hi, (n) => notionalFor(n) <= wantAmount);
        }
      }

      if (input?.limitPrice != null) {
        const raw = safeNum(input.limitPrice, -1);
        if (!(raw > 0 && raw <= 1)) {
          return emptyQuote(side, "Limit price must be between 0 and 1");
        }
        const withinLimit = (n: number) =>
          side === "BUY" ? marginalAfter(n) <= raw + 1e-12 : marginalAfter(n) >= raw - 1e-12;
        if (!withinLimit(0)) {
          return emptyQuote(side, "No fills at this limit price");
        }
        const capped = largestFeasible(target, withinLimit);
        if (capped < target - SHARE_EPS) partial = true;
        target = capped;
      }

      if (target <= SHARE_EPS) {
        return emptyQuote(side, "Order could not be filled");
      }

      // Режем сделку на куски, чтобы у UI были «уровни» как у стакана.
      const levels: QuoteLevel[] = [];
      const chunks = target > SHARE_EPS * 10 ? CHUNKS : 1;
      let prevShares = 0;
      let prevNotional = 0;
      for (let i = 1; i <= chunks; i += 1) {
        const upTo = (target * i) / chunks;
        const notional = notionalFor(upTo);
        const chunkShares = upTo - prevShares;
        const chunkCost = Math.max(0, notional - prevNotional);
        prevShares = upTo;
        prevNotional = notional;
        if (chunkShares <= SHARE_EPS || chunkCost <= 0) continue;
        levels.push({
          price: clampPrice(chunkCost / chunkShares),
          shares: chunkShares,
          cost: chunkCost,
        });
      }

      if (levels.length === 0) {
        return emptyQuote(side, "Order could not be filled");
      }

      return finalizeQuote({ side, levels, bestPrice: startPrice, feeRate, partial });
    },
  };
}
