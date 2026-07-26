/**
 * Движок по умолчанию: проход по реальному стакану CLOB.
 *
 * BUY съедает asks по возрастанию цены, SELL — bids по убыванию.
 * Поддерживает режим «на сумму» (amount) и «на количество» (shares),
 * уважает лимитную цену и никогда не бросает исключений.
 */

import type { BookLevel } from "@/lib/types";
import {
  clampPrice,
  emptyQuote,
  feeRateFromBps,
  finalizeQuote,
  normalizeTick,
  roundToTick,
  safeNum,
  SHARE_EPS,
  type PricingEngine,
  type Quote,
  type QuoteInput,
  type QuoteLevel,
} from "./types";

/** Допуск при сравнении сумм в долларах (доли цента). */
const MONEY_EPS = 1e-6;

/** Сортированные и вычищенные уровни на нужной стороне стакана. */
function usableLevels(raw: BookLevel[] | undefined, side: QuoteInput["side"], tick: number) {
  const source = Array.isArray(raw) ? raw : [];
  const levels = source
    .map((level) => ({
      price: roundToTick(safeNum(level?.price, 0), tick),
      size: Math.max(0, safeNum(level?.size, 0)),
    }))
    .filter((level) => level.price > 0 && level.price <= 1 && level.size > SHARE_EPS);

  levels.sort((a, b) => (side === "BUY" ? a.price - b.price : b.price - a.price));
  return levels;
}

export const orderBookEngine: PricingEngine = {
  name: "orderbook",

  quote(input: QuoteInput): Quote {
    const side = input?.side === "SELL" ? "SELL" : "BUY";
    const tick = normalizeTick(input?.tickSize);
    const feeRate = feeRateFromBps(input?.feeBps);

    const wantShares = safeNum(input?.shares, 0);
    const wantAmount = safeNum(input?.amount, 0);
    const byShares = wantShares > SHARE_EPS;
    if (!byShares && wantAmount <= MONEY_EPS) {
      return emptyQuote(side, "Enter an amount");
    }

    let limit: number | null = null;
    if (input?.limitPrice != null) {
      const raw = safeNum(input.limitPrice, -1);
      if (!(raw > 0 && raw <= 1)) {
        return emptyQuote(side, "Limit price must be between 0 and 1");
      }
      limit = roundToTick(raw, tick);
    }

    const book = input?.book;
    const levels = usableLevels(side === "BUY" ? book?.asks : book?.bids, side, tick);
    if (levels.length === 0) {
      return emptyQuote(side, "No liquidity in the order book");
    }

    const targetShares = byShares ? wantShares : Number.POSITIVE_INFINITY;
    const budget = byShares ? Number.POSITIVE_INFINITY : wantAmount;

    const fills: QuoteLevel[] = [];
    let filled = 0;
    let spent = 0;

    for (const level of levels) {
      // За лимитом стакан для нас закрыт — дальше цены только хуже.
      if (limit != null) {
        if (side === "BUY" && level.price > limit + 1e-12) break;
        if (side === "SELL" && level.price < limit - 1e-12) break;
      }

      const sharesLeft = targetShares - filled;
      const moneyLeft = budget - spent;
      if (sharesLeft <= SHARE_EPS || moneyLeft <= MONEY_EPS) break;

      let take = Math.min(level.size, sharesLeft);
      if (!byShares) take = Math.min(take, moneyLeft / level.price);
      if (take <= SHARE_EPS) break;

      const cost = take * level.price;
      fills.push({ price: level.price, shares: take, cost });
      filled += take;
      spent += cost;
    }

    if (filled <= SHARE_EPS) {
      return emptyQuote(
        side,
        limit != null ? "No orders match your limit price" : "Insufficient liquidity",
      );
    }

    const partial = byShares
      ? filled < wantShares - SHARE_EPS
      : spent < wantAmount - MONEY_EPS;

    return finalizeQuote({
      side,
      levels: fills,
      bestPrice: clampPrice(levels[0].price),
      feeRate,
      partial,
    });
  },
};
