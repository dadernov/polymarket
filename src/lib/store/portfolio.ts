"use client";

/**
 * Бумажный портфель: кэш, позиции и лента исполнений. Живёт только в
 * localStorage, сервер о нём ничего не знает.
 *
 * ── SSR и гидратация ───────────────────────────────────────────────────
 * Стор создаётся с `skipHydration: true`, поэтому при первом рендере — и на
 * сервере, и на клиенте — в нём лежат дефолты (cash = STARTING_CASH, пустые
 * позиции). Значит разметка совпадает и React не ругается.
 *
 * Компонент, который показывает цифры портфеля, ОБЯЗАН сделать так:
 *
 *   const hydrated = useHydrated();
 *   const cash = usePortfolioStore((s) => s.cash);
 *   if (!hydrated) return <Skeleton className="h-6 w-20" />;
 *
 * `useHydrated()` сам инициирует чтение из localStorage в useEffect и
 * возвращает true уже после него.
 *
 * Экшены (buy/sell/deposit/resetAll) безопасны и без монтирования хука:
 * каждый из них перед работой вызывает ensureHydrated(), так что записать
 * дефолты поверх сохранённого портфеля невозможно.
 */

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Side } from "@/lib/pricing/types";

/** Стартовый баланс бумажного счёта. */
export const STARTING_CASH = 10_000;

const STORAGE_KEY = "pm.portfolio.v1";
const MAX_FILLS = 500;
/** Позиция меньше этого считается закрытой. */
const EPS = 1e-6;

export interface Position {
  /** `${conditionId}:${tokenId}` */
  id: string;
  eventSlug: string;
  eventTitle: string;
  marketQuestion: string;
  marketId: string;
  conditionId: string;
  tokenId: string;
  outcomeLabel: string;
  outcomeIndex: number;
  icon: string | null;
  shares: number;
  /** Средняя цена входа с учётом комиссии — это себестоимость акции. */
  avgPrice: number;
  /** Реализованный P&L по этой позиции (копится при частичных продажах). */
  realizedPnl: number;
  openedAt: number;
  updatedAt: number;
}

export interface Fill {
  id: string;
  timestamp: number;
  side: Side;
  shares: number;
  price: number;
  cost: number;
  fee: number;
  eventSlug: string;
  eventTitle: string;
  outcomeLabel: string;
  tokenId: string;
  conditionId: string;
  icon: string | null;
  /** Ненулевой только у продаж. */
  realizedPnl: number;
}

/** Метаданные рынка + параметры сделки, которых хватает на новую позицию. */
export interface TradeArgs {
  eventSlug: string;
  eventTitle: string;
  marketQuestion: string;
  marketId: string;
  conditionId: string;
  tokenId: string;
  outcomeLabel: string;
  outcomeIndex: number;
  icon: string | null;
  shares: number;
  /** Цена исполнения 0..1 (обычно `quote.avgPrice`). */
  price: number;
  /** Комиссия в долларах (обычно `quote.fee`). */
  fee?: number;
}

export interface TradeResult {
  ok: boolean;
  error?: string;
}

export interface PortfolioState {
  cash: number;
  positions: Record<string, Position>;
  fills: Fill[];
  /** Реализованный P&L за всё время, включая уже закрытые позиции. */
  realized: number;
  buy: (args: TradeArgs) => TradeResult;
  sell: (args: TradeArgs) => TradeResult;
  deposit: (amount: number) => void;
  resetAll: () => void;
}

type PersistedPortfolio = Pick<PortfolioState, "cash" | "positions" | "fills" | "realized">;

/* ------------------------------------------------------------------ */
/* Утилиты                                                             */
/* ------------------------------------------------------------------ */

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Ключ позиции. Экспортируется, чтобы UI мог достать позицию селектором. */
export function positionId(conditionId: string, tokenId: string): string {
  return `${conditionId}:${tokenId}`;
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ParsedTrade {
  shares: number;
  price: number;
  fee: number;
}

function parseTrade(args: TradeArgs): ParsedTrade | string {
  if (!args?.tokenId || !args?.conditionId) return "Market is missing";
  const shares = num(args.shares);
  const price = num(args.price);
  if (!(shares > EPS)) return "Enter a size";
  if (!(price > 0 && price <= 1)) return "Invalid price";
  return { shares, price, fee: Math.max(0, num(args.fee)) };
}

function buildPosition(args: TradeArgs, id: string, now: number): Position {
  return {
    id,
    eventSlug: args.eventSlug ?? "",
    eventTitle: args.eventTitle ?? "",
    marketQuestion: args.marketQuestion ?? "",
    marketId: args.marketId ?? "",
    conditionId: args.conditionId,
    tokenId: args.tokenId,
    outcomeLabel: args.outcomeLabel ?? "",
    outcomeIndex: Math.max(0, Math.floor(num(args.outcomeIndex))),
    icon: args.icon ?? null,
    shares: 0,
    avgPrice: 0,
    realizedPnl: 0,
    openedAt: now,
    updatedAt: now,
  };
}

function makeFill(
  args: TradeArgs,
  side: Side,
  shares: number,
  price: number,
  cost: number,
  fee: number,
  realizedPnl: number,
  now: number,
): Fill {
  return {
    id: makeId(),
    timestamp: now,
    side,
    shares,
    price,
    cost,
    fee,
    eventSlug: args.eventSlug ?? "",
    eventTitle: args.eventTitle ?? "",
    outcomeLabel: args.outcomeLabel ?? "",
    tokenId: args.tokenId,
    conditionId: args.conditionId,
    icon: args.icon ?? null,
    realizedPnl,
  };
}

const initialState: PersistedPortfolio = {
  cash: STARTING_CASH,
  positions: {},
  fills: [],
  realized: 0,
};

/* ------------------------------------------------------------------ */
/* Стор                                                                */
/* ------------------------------------------------------------------ */

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      ...initialState,

      buy: (args) => {
        ensureHydrated();
        const parsed = parseTrade(args);
        if (typeof parsed === "string") return { ok: false, error: parsed };

        const { shares, price, fee } = parsed;
        const cost = shares * price;
        const total = cost + fee;
        const state = get();
        if (total > state.cash + EPS) return { ok: false, error: "Insufficient balance" };

        const now = Date.now();
        const id = positionId(args.conditionId, args.tokenId);
        const prev = state.positions[id] ?? buildPosition(args, id, now);
        const nextShares = prev.shares + shares;
        // Комиссия входит в себестоимость, поэтому усредняем по total.
        const nextAvg = clamp01((prev.shares * prev.avgPrice + total) / nextShares);

        const position: Position = {
          ...prev,
          // Метаданные могли обновиться (иконка, заголовок) — берём свежие.
          eventSlug: args.eventSlug ?? prev.eventSlug,
          eventTitle: args.eventTitle ?? prev.eventTitle,
          marketQuestion: args.marketQuestion ?? prev.marketQuestion,
          icon: args.icon ?? prev.icon,
          shares: nextShares,
          avgPrice: nextAvg,
          updatedAt: now,
        };

        const fill = makeFill(args, "BUY", shares, price, cost, fee, 0, now);
        set({
          cash: Math.max(0, state.cash - total),
          positions: { ...state.positions, [id]: position },
          fills: [fill, ...state.fills].slice(0, MAX_FILLS),
        });
        return { ok: true };
      },

      sell: (args) => {
        ensureHydrated();
        const parsed = parseTrade(args);
        if (typeof parsed === "string") return { ok: false, error: parsed };

        const { price, fee } = parsed;
        const state = get();
        const id = positionId(args.conditionId, args.tokenId);
        const prev = state.positions[id];
        if (!prev || prev.shares <= EPS) return { ok: false, error: "No position to sell" };
        if (parsed.shares > prev.shares + EPS) return { ok: false, error: "Not enough shares" };

        const shares = Math.min(parsed.shares, prev.shares);
        const gross = shares * price;
        const net = Math.max(0, gross - fee);
        const realized = net - shares * prev.avgPrice;
        const remaining = prev.shares - shares;
        const now = Date.now();

        const positions = { ...state.positions };
        if (remaining <= EPS) {
          delete positions[id];
        } else {
          positions[id] = {
            ...prev,
            shares: remaining,
            realizedPnl: prev.realizedPnl + realized,
            updatedAt: now,
          };
        }

        const fill = makeFill(args, "SELL", shares, price, gross, fee, realized, now);
        set({
          cash: state.cash + net,
          positions,
          fills: [fill, ...state.fills].slice(0, MAX_FILLS),
          realized: state.realized + realized,
        });
        return { ok: true };
      },

      deposit: (amount) => {
        ensureHydrated();
        const value = num(amount);
        if (!(value > 0)) return;
        set({ cash: get().cash + value });
      },

      resetAll: () => {
        ensureHydrated();
        set({ ...initialState });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      skipHydration: true,
      storage: createJSONStorage<PersistedPortfolio>(() => localStorage),
      partialize: (state): PersistedPortfolio => ({
        cash: state.cash,
        positions: state.positions,
        fills: state.fills,
        realized: state.realized,
      }),
    },
  ),
);

/** Короткий алиас: `usePortfolio((s) => s.cash)`. */
export const usePortfolio = usePortfolioStore;

/* ------------------------------------------------------------------ */
/* Гидратация                                                          */
/* ------------------------------------------------------------------ */

let rehydrateRequested = false;

/** Однократно поднимает состояние из localStorage. На сервере — no-op. */
function ensureHydrated(): void {
  if (rehydrateRequested || typeof window === "undefined") return;
  rehydrateRequested = true;
  void usePortfolioStore.persist.rehydrate();
}

function subscribeHydration(onChange: () => void): () => void {
  const unsubscribe = usePortfolioStore.persist.onFinishHydration(onChange);
  ensureHydrated();
  return unsubscribe;
}

const getHydrationSnapshot = () => usePortfolioStore.persist.hasHydrated();
const getServerHydrationSnapshot = () => false;

/**
 * true после чтения localStorage. На сервере и в первом клиентском рендере —
 * всегда false, поэтому разметка совпадает и React не ругается.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeHydration,
    getHydrationSnapshot,
    getServerHydrationSnapshot,
  );
}

/* ------------------------------------------------------------------ */
/* Чистые селекторы (работают и вне React)                             */
/* ------------------------------------------------------------------ */

/** Текущая стоимость позиции по рыночной цене. */
export function positionValue(position: Position, currentPrice: number): number {
  return num(position?.shares) * clamp01(num(currentPrice));
}

/** Себестоимость позиции: shares * avgPrice. */
export function positionCost(position: Position): number {
  return num(position?.shares) * clamp01(num(position?.avgPrice));
}

/** Нереализованный P&L в долларах. */
export function positionPnl(position: Position, currentPrice: number): number {
  return positionValue(position, currentPrice) - positionCost(position);
}

/** Нереализованный P&L в долях от вложенного (0.25 = +25%). */
export function positionReturnPct(position: Position, currentPrice: number): number {
  const cost = positionCost(position);
  if (cost <= EPS) return 0;
  return positionPnl(position, currentPrice) / cost;
}

export interface PortfolioTotals {
  /** Себестоимость открытых позиций. */
  invested: number;
  /** Их текущая рыночная стоимость. */
  value: number;
  unrealized: number;
  /** Реализованный P&L по переданным позициям. */
  realized: number;
  /** Общий P&L: unrealized + realized. */
  total: number;
}

/**
 * Сводка по позициям. `priceByTokenId` — текущие цены исходов; если цены нет,
 * берём avgPrice (позиция показывается «в нуле», а не в минус 100%).
 *
 * Учтите: `realized` считается только по переданным позициям. Итог за всё
 * время, включая закрытые, лежит в `usePortfolioStore.getState().realized`.
 */
export function portfolioTotals(
  positions: Record<string, Position> | Position[],
  priceByTokenId: Record<string, number>,
): PortfolioTotals {
  const list = Array.isArray(positions) ? positions : Object.values(positions ?? {});
  let invested = 0;
  let value = 0;
  let realized = 0;

  for (const position of list) {
    if (!position) continue;
    const raw = priceByTokenId?.[position.tokenId];
    const price = Number.isFinite(raw) ? clamp01(num(raw)) : clamp01(num(position.avgPrice));
    invested += positionCost(position);
    value += num(position.shares) * price;
    realized += num(position.realizedPnl);
  }

  const unrealized = value - invested;
  return { invested, value, unrealized, realized, total: unrealized + realized };
}
