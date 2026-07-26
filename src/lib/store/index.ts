"use client";

/**
 * Клиентские сторы. Оба persist'ятся в localStorage и требуют гидратации
 * перед показом цифр — подробности в portfolio.ts и watchlist.ts.
 */

export {
  positionCost,
  positionId,
  positionPnl,
  positionReturnPct,
  positionValue,
  portfolioTotals,
  STARTING_CASH,
  useHydrated,
  usePortfolio,
  usePortfolioStore,
  type Fill,
  type PortfolioState,
  type PortfolioTotals,
  type Position,
  type TradeArgs,
  type TradeResult,
} from "./portfolio";

export {
  useIsWatched,
  useWatchlist,
  useWatchlistHydrated,
  useWatchlistStore,
  type WatchlistState,
} from "./watchlist";
