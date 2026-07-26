/**
 * Контракт торгового движка: типы входа/выхода котировки плюс несколько
 * общих числовых помощников, чтобы любые реализации считали комиссию,
 * округление и доходность одинаково.
 *
 * Здесь нет ни UI, ни хранилища, ни сети — только чистая математика.
 */

import type { OrderBook } from "@/lib/types";

export type Side = "BUY" | "SELL";

export interface QuoteInput {
  side: Side;
  /** Стакан торгуемого токена. Движки без стакана используют только `tokenId`. */
  book: OrderBook;
  /**
   * Купить/продать на сумму в долларах (взаимоисключающе с shares).
   * Это номинал сделки без комиссии — комиссия начисляется сверх.
   */
  amount?: number;
  /** Купить/продать конкретное число акций. */
  shares?: number;
  /** Лимитная цена 0..1; для рыночной заявки не задаётся. */
  limitPrice?: number;
  /** Минимальный шаг цены, обычно 0.01 или 0.001. */
  tickSize: number;
  /** Комиссия в базисных пунктах (100 bps = 1%). */
  feeBps: number;
}

/** Один «срез» исполнения: сколько акций ушло по какой цене. */
export interface QuoteLevel {
  price: number;
  shares: number;
  cost: number;
}

export interface Quote {
  side: Side;
  /** Итоговое число акций (== filledShares, дублируется для удобства UI). */
  shares: number;
  /** Номинал сделки без комиссии: сумма по всем уровням. */
  cost: number;
  /** cost / shares. Не обязан лежать на тике — это средняя от тиков. */
  avgPrice: number;
  /** Худшая цена среди задействованных уровней. */
  worstPrice: number;
  /** Проскальзывание против лучшей цены, в долях. */
  slippage: number;
  fee: number;
  /** BUY: cost + fee (сколько спишется). SELL: cost - fee (сколько придёт). */
  total: number;
  /**
   * Сколько заплатит/получит трейдер при выигрыше исхода.
   * BUY  — shares * $1 (каждая выигравшая акция гасится по доллару).
   * SELL — `total`: продавец уже забрал деньги, при выигрыше исхода он
   *        отдаёт акции и больше ничего не получает.
   */
  payout: number;
  /**
   * BUY  — payout - total (прибыль, если исход наступит).
   * SELL — total (прибыль короткой позиции, если исход НЕ наступит).
   */
  profitIfWin: number;
  /** profitIfWin / вложенное (BUY: total, SELL: максимальный убыток shares - total). */
  returnPct: number;
  levels: QuoteLevel[];
  /** Заявка не может быть исполнена целиком книгой. */
  partial: boolean;
  filledShares: number;
  error: string | null;
}

export interface PricingEngine {
  name: string;
  quote(input: QuoteInput): Quote;
}

/* ------------------------------------------------------------------ */
/* Общие помощники для движков                                         */
/* ------------------------------------------------------------------ */

/** Порог, ниже которого объём считаем нулевым. */
export const SHARE_EPS = 1e-9;

/** Любое «мусорное» значение превращаем в число, NaN/Infinity — в fallback. */
export function safeNum(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clampPrice(price: number): number {
  if (!Number.isFinite(price)) return 0;
  return Math.min(1, Math.max(0, price));
}

/** Шаг цены: только положительный, по умолчанию цент. */
export function normalizeTick(tickSize: number): number {
  const t = safeNum(tickSize, 0);
  return t > 0 && t <= 1 ? t : 0.01;
}

/** Округление цены к сетке тика без хвостов вида 0.30000000000000004. */
export function roundToTick(price: number, tickSize: number): number {
  const tick = normalizeTick(tickSize);
  const p = safeNum(price, 0);
  const decimals = Math.min(10, Math.max(0, Math.ceil(-Math.log10(tick)) + 2));
  return clampPrice(Number((Math.round(p / tick) * tick).toFixed(decimals)));
}

/** Комиссия в долях от номинала. Отрицательные и абсурдные bps отсекаем. */
export function feeRateFromBps(feeBps: number): number {
  const bps = safeNum(feeBps, 0);
  return Math.min(1, Math.max(0, bps / 10_000));
}

/** Пустая котировка: все нули и текст ошибки. Никогда не NaN. */
export function emptyQuote(side: Side, error: string | null): Quote {
  return {
    side,
    shares: 0,
    cost: 0,
    avgPrice: 0,
    worstPrice: 0,
    slippage: 0,
    fee: 0,
    total: 0,
    payout: 0,
    profitIfWin: 0,
    returnPct: 0,
    levels: [],
    partial: false,
    filledShares: 0,
    error,
  };
}

export interface FinalizeArgs {
  side: Side;
  /** Срезы исполнения, уже округлённые по тику. */
  levels: QuoteLevel[];
  /** Лучшая доступная цена до сделки — база для проскальзывания. */
  bestPrice: number;
  /** Комиссия в долях (см. feeRateFromBps). */
  feeRate: number;
  partial: boolean;
}

/**
 * Собирает Quote из срезов исполнения: комиссия, проскальзывание, доходность.
 * Вынесено сюда, чтобы стакан и LMSR не разъезжались в мелочах.
 */
export function finalizeQuote({ side, levels, bestPrice, feeRate, partial }: FinalizeArgs): Quote {
  let shares = 0;
  let cost = 0;
  let worstPrice = 0;

  for (const level of levels) {
    shares += level.shares;
    cost += level.cost;
    worstPrice = level.price;
  }

  if (shares <= SHARE_EPS || cost <= 0) {
    return emptyQuote(side, "Order could not be filled");
  }

  const avgPrice = clampPrice(cost / shares);
  const best = clampPrice(bestPrice) || avgPrice;
  const rawSlippage = side === "BUY" ? (avgPrice - best) / best : (best - avgPrice) / best;
  const slippage = best > 0 ? Math.max(0, safeNum(rawSlippage, 0)) : 0;

  const fee = Math.max(0, cost * feeRate);
  const total = side === "BUY" ? cost + fee : Math.max(0, cost - fee);

  let payout: number;
  let profitIfWin: number;
  let returnPct: number;

  if (side === "BUY") {
    payout = shares;
    profitIfWin = payout - total;
    returnPct = total > 0 ? profitIfWin / total : 0;
  } else {
    // Короткая позиция: выручка уже на руках, риск — доплатить до $1 за акцию.
    payout = total;
    profitIfWin = total;
    const maxLoss = shares - total;
    returnPct = maxLoss > SHARE_EPS ? profitIfWin / maxLoss : 0;
  }

  return {
    side,
    shares,
    cost,
    avgPrice,
    worstPrice: clampPrice(worstPrice),
    slippage,
    fee,
    total,
    payout,
    profitIfWin: safeNum(profitIfWin, 0),
    returnPct: safeNum(returnPct, 0),
    levels,
    partial,
    filledShares: shares,
    error: null,
  };
}
