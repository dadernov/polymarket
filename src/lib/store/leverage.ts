"use client";

/**
 * Бумажные плечевые («турбо») позиции. Вся математика — в
 * @/lib/pricing/leverage, здесь только хранение и движение денег.
 *
 * ── Кошелёк ────────────────────────────────────────────────────────────
 * Денежный баланс в приложении ОДИН — `usePortfolio.cash`. Отдельного
 * кошелька для плеча нет: `openPosition` списывает маржу ВМЕСТЕ с тарифом,
 * `closePosition` возвращает маржу и движение цены. Сгоревшая позиция не
 * возвращает ничего — маржа и есть максимальный убыток.
 *
 * ── Тариф ──────────────────────────────────────────────────────────────
 * Ни спреда, ни ежедневного финансирования в их модели нет: игрок платит
 * РАЗОВЫЙ тариф при открытии (капитал + гэп-премия + платформа). Он списан
 * вперёд, поэтому хранится в позиции и вычитается из её P&L, а на счёт при
 * закрытии возвращается маржа плюс «грязный» результат движения цены.
 *
 * ── SSR и гидратация ───────────────────────────────────────────────────
 * Устроено ровно как в portfolio.ts: `skipHydration: true`, первый рендер
 * отдаёт пустой список, реальные данные приезжают в useEffect. Компонент с
 * цифрами обязан спросить `useLeverageHydrated()` (или общий `useHydrated`
 * из portfolio.ts — оба поднимают своё хранилище сами).
 *
 * Экшены безопасны и без хука: каждый перед работой вызывает
 * ensureHydrated(), поэтому записать дефолты поверх сохранённого нельзя.
 */

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { leveragePnlAt, quoteLeverage, type LeverageSide } from "@/lib/pricing/leverage";
import { Exposure, poolLimits, PoolRiskEngine } from "@/lib/pricing/pool-risk";
import { priceToTicks } from "@/lib/pricing/ticks";
import { usePortfolioStore } from "./portfolio";

export type { LeverageSide } from "@/lib/pricing/leverage";

const STORAGE_KEY = "pm.leverage.v1";
const EPS = 1e-6;

export interface LeveragePosition {
  id: string;
  eventSlug: string;
  eventTitle: string;
  marketQuestion: string;
  conditionId: string;
  tokenId: string;
  outcomeLabel: string;
  icon: string | null;
  side: LeverageSide;
  margin: number;
  leverage: number;
  entryPrice: number;
  tokens: number;
  knockoutPrice: number;
  /**
   * Разовый тариф, уплаченный при открытии. Поле необязательное: позиции,
   * сохранённые до появления тарифа, читаются как ноль и не ломают гидратацию.
   */
  tariffPaid?: number;
  openedAt: number;
  /** Заполняется при сгорании позиции. */
  knockedOutAt: number | null;
}

/** Метаданные рынка + параметры сделки. Тариф считает движок. */
export interface OpenLeverageArgs {
  eventSlug: string;
  eventTitle: string;
  marketQuestion: string;
  conditionId: string;
  tokenId: string;
  outcomeLabel: string;
  icon: string | null;
  side: LeverageSide;
  margin: number;
  leverage: number;
  entryPrice: number;
  /** id рынка для лимитов пула; по умолчанию `conditionId`. */
  marketId?: string;
}

export interface LeverageResult {
  ok: boolean;
  error?: string;
  id?: string;
  /** У закрытия — реализованный P&L. */
  pnl?: number;
}

export interface LeverageState {
  positions: Record<string, LeveragePosition>;
  /** Реализованный P&L: закрытые позиции и сгоревшая маржа. */
  realized: number;
  openPosition: (args: OpenLeverageArgs) => LeverageResult;
  closePosition: (id: string, price: number) => LeverageResult;
  /** Помечает сгоревшие позиции. Возвращает, сколько сгорело в этом проходе. */
  markPrices: (priceByTokenId: Record<string, number>) => number;
  resetAll: () => void;
}

type PersistedLeverage = Pick<LeverageState, "positions" | "realized">;

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

function makeId(): string {
  return `lev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Цена достигла нокаута — позиция сгорела. Сравнение целочисленное, в тиках:
 * у их модели цена ходит только центами, и 20.4¢ — это тик 20, то есть касание
 * нокаута на 20, а не «чуть выше него».
 */
function isKnockedOut(position: LeveragePosition, price: number): boolean {
  const knockout = num(position.knockoutPrice, -1);
  if (!(knockout >= 0)) return false;
  const tick = priceToTicks(price);
  const knockoutTick = priceToTicks(knockout);
  return position.side === "LONG" ? tick <= knockoutTick : tick >= knockoutTick;
}

/** Уплаченный вперёд тариф. У старых сохранённых позиций его нет — это ноль. */
export function leveragePositionTariff(position: LeveragePosition): number {
  return Math.max(0, num(position?.tariffPaid));
}

/**
 * Обязательство пула по позиции — их `max_payout`. Не хранится: восстановить
 * из размера и цены входа точнее, чем плодить поле, которого нет у старых
 * записей (LONG: size×(1−p0), SHORT: size×p0).
 */
export function leveragePositionMaxPayout(position: LeveragePosition): number {
  if (!position) return 0;
  const tokens = Math.max(0, num(position.tokens));
  const entry = clamp01(num(position.entryPrice));
  return position.side === "LONG" ? tokens * (1 - entry) : tokens * entry;
}

/* ------------------------------------------------------------------ */
/* Пул                                                                 */
/* ------------------------------------------------------------------ */

/**
 * КАПИТАЛ ПУЛА — ЗАГЛУШКА. Настоящий пул живёт в контракте и знает свой TVL;
 * до появления сервера фронт считает лимиты от этого числа, иначе вердикт
 * «позиция принята» ничего бы не значил. Отсюда: ≤3% ($7 500) обязательств на
 * один рынок, ≤10% на кластер связанных рынков, ≤30% на весь пул.
 */
export const POOL_CAPITAL = 250_000;

/**
 * Риск-движок пула, заряженный уже открытыми позициями. Пустой движок пропускал
 * бы всё подряд, а с наполнением видно и неттинг: встречный шорт по тому же
 * рынку уменьшает перекос и освобождает лимит.
 *
 * Кластеров на фронте нет — каждый рынок сам себе кластер, ровно как в их
 * `pool_risk.py` при пустом словаре `clusters`.
 */
export function leveragePool(
  positions: Record<string, LeveragePosition> | LeveragePosition[],
): PoolRiskEngine {
  const engine = new PoolRiskEngine(poolLimits(POOL_CAPITAL));
  const list = Array.isArray(positions) ? positions : Object.values(positions ?? {});

  for (const position of list) {
    if (!position || position.knockedOutAt != null) continue;
    const marketId = position.conditionId;
    if (!marketId) continue;

    const exposure = engine.exposure.get(marketId) ?? new Exposure();
    const payout = leveragePositionMaxPayout(position);
    if (position.side === "LONG") exposure.longPayout += payout;
    else exposure.shortPayout += payout;
    engine.exposure.set(marketId, exposure);
  }

  return engine;
}

/* ------------------------------------------------------------------ */
/* Общий кошелёк                                                       */
/* ------------------------------------------------------------------ */

function ensurePortfolioHydrated(): void {
  if (typeof window === "undefined") return;
  if (usePortfolioStore.persist.hasHydrated()) return;
  // localStorage синхронный, поэтому состояние поднимется до следующей строки.
  void usePortfolioStore.persist.rehydrate();
}

function portfolioCash(): number {
  ensurePortfolioHydrated();
  return num(usePortfolioStore.getState().cash);
}

function addPortfolioCash(delta: number): void {
  ensurePortfolioHydrated();
  const cash = num(usePortfolioStore.getState().cash);
  usePortfolioStore.setState({ cash: Math.max(0, cash + delta) });
}

/* ------------------------------------------------------------------ */
/* Стор                                                                */
/* ------------------------------------------------------------------ */

const initialState: PersistedLeverage = {
  positions: {},
  realized: 0,
};

export const useLeverageStore = create<LeverageState>()(
  persist(
    (set, get) => ({
      ...initialState,

      openPosition: (args) => {
        ensureHydrated();
        if (!args?.tokenId || !args?.conditionId) return { ok: false, error: "Market is missing" };

        const quote = quoteLeverage({
          side: args.side,
          entryPrice: num(args.entryPrice),
          margin: num(args.margin),
          leverage: num(args.leverage),
          marketId: args.marketId ?? args.conditionId,
          // Тот же движок, что показывает вердикт в панели: разрешить здесь
          // то, что там помечено отказом, значило бы врать в интерфейсе.
          pool: leveragePool(get().positions),
        });
        if (quote.error) return { ok: false, error: quote.error };
        if (quote.pool && !quote.pool.ok) return { ok: false, error: quote.pool.reason };

        // Тариф списывается вперёд вместе с маржой — денег нужно на оба.
        const charge = quote.margin + quote.tariff.total;
        if (charge > portfolioCash() + EPS) {
          return { ok: false, error: "Insufficient balance" };
        }

        const now = Date.now();
        const id = makeId();
        const position: LeveragePosition = {
          id,
          eventSlug: args.eventSlug ?? "",
          eventTitle: args.eventTitle ?? "",
          marketQuestion: args.marketQuestion ?? "",
          conditionId: args.conditionId,
          tokenId: args.tokenId,
          outcomeLabel: args.outcomeLabel ?? "",
          icon: args.icon ?? null,
          side: quote.side,
          margin: quote.margin,
          leverage: quote.leverage,
          entryPrice: quote.entryPrice,
          tokens: quote.tokens,
          knockoutPrice: quote.knockoutPrice,
          tariffPaid: quote.tariff.total,
          openedAt: now,
          knockedOutAt: null,
        };

        addPortfolioCash(-charge);
        set({ positions: { ...get().positions, [id]: position } });
        return { ok: true, id };
      },

      closePosition: (id, price) => {
        ensureHydrated();
        const state = get();
        const position = state.positions[id];
        if (!position) return { ok: false, error: "Position not found" };

        const value = num(price, -1);
        if (!(value >= 0 && value <= 1)) return { ok: false, error: "Invalid price" };

        const positions = { ...state.positions };
        delete positions[id];

        // Сгоревшая позиция уже списана в realized — закрытие лишь убирает её.
        if (position.knockedOutAt != null) {
          set({ positions });
          return {
            ok: true,
            id,
            pnl: -(Math.max(0, num(position.margin)) + leveragePositionTariff(position)),
          };
        }

        const pnl = leveragePositionPnl(position, value);
        const credited = leveragePositionValue(position, value);
        if (credited > 0) addPortfolioCash(credited);
        set({ positions, realized: state.realized + pnl });
        return { ok: true, id, pnl };
      },

      markPrices: (priceByTokenId) => {
        ensureHydrated();
        if (!priceByTokenId) return 0;

        const state = get();
        const now = Date.now();
        let positions: Record<string, LeveragePosition> | null = null;
        let burned = 0;
        let count = 0;

        for (const position of Object.values(state.positions)) {
          if (!position || position.knockedOutAt != null) continue;
          const raw = priceByTokenId[position.tokenId];
          if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
          if (!isKnockedOut(position, clamp01(raw))) continue;

          positions = positions ?? { ...state.positions };
          positions[position.id] = { ...position, knockedOutAt: now };
          // Сгорает маржа целиком, а тариф уже был уплачен — убыток из обоих.
          burned += Math.max(0, num(position.margin)) + leveragePositionTariff(position);
          count += 1;
        }

        // Ничего не изменилось — не дёргаем подписчиков (метод зовут из эффекта).
        if (!positions) return 0;
        set({ positions, realized: state.realized - burned });
        return count;
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
      storage: createJSONStorage<PersistedLeverage>(() => localStorage),
      partialize: (state): PersistedLeverage => ({
        positions: state.positions,
        realized: state.realized,
      }),
    },
  ),
);

/** Короткий алиас: `useLeverage((s) => s.positions)`. */
export const useLeverage = useLeverageStore;

/* ------------------------------------------------------------------ */
/* Гидратация                                                          */
/* ------------------------------------------------------------------ */

let rehydrateRequested = false;

function ensureHydrated(): void {
  if (rehydrateRequested || typeof window === "undefined") return;
  rehydrateRequested = true;
  void useLeverageStore.persist.rehydrate();
}

function subscribeHydration(onChange: () => void): () => void {
  const unsubscribe = useLeverageStore.persist.onFinishHydration(onChange);
  ensureHydrated();
  return unsubscribe;
}

const getHydrationSnapshot = () => useLeverageStore.persist.hasHydrated();
const getServerHydrationSnapshot = () => false;

/** true после чтения localStorage; сервер и первый клиентский рендер — false. */
export function useLeverageHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, getHydrationSnapshot, getServerHydrationSnapshot);
}

/* ------------------------------------------------------------------ */
/* Чистые селекторы (работают и вне React)                             */
/* ------------------------------------------------------------------ */

/**
 * P&L позиции при текущей цене — ЧИСТЫЙ, за вычетом уплаченного тарифа.
 * Сгоревшая позиция всегда стоит −(маржа + тариф) и больше не переоценивается.
 */
export function leveragePositionPnl(position: LeveragePosition, currentPrice: number): number {
  if (!position) return 0;
  const margin = Math.max(0, num(position.margin));
  const costs = leveragePositionTariff(position);
  if (position.knockedOutAt != null) return -(margin + costs);

  return leveragePnlAt({
    side: position.side,
    tokens: num(position.tokens),
    entryPrice: num(position.entryPrice),
    margin,
    knockoutPrice: num(position.knockoutPrice),
    price: num(currentPrice, num(position.entryPrice)),
    costs,
  });
}

/**
 * Сколько вернётся на счёт при закрытии по этой цене. Тариф списан ещё при
 * открытии, поэтому обратно идёт маржа плюс «грязное» движение цены — то есть
 * чистый P&L, в который тариф возвращён обратно. Не меньше нуля: долга нет.
 */
export function leveragePositionValue(position: LeveragePosition, currentPrice: number): number {
  if (!position) return 0;
  const pnl = leveragePositionPnl(position, currentPrice);
  return Math.max(0, num(position.margin) + pnl + leveragePositionTariff(position));
}

/** P&L в долях от внесённой маржи (0.25 = +25%). */
export function leveragePositionReturnPct(
  position: LeveragePosition,
  currentPrice: number,
): number {
  const margin = Math.max(0, num(position?.margin));
  if (margin <= EPS) return 0;
  return leveragePositionPnl(position, currentPrice) / margin;
}

/** Сколько цена может пройти против позиции до нокаута, в долях цены. */
export function leverageDistanceToKnockout(
  position: LeveragePosition,
  currentPrice: number,
): number {
  if (!position) return 0;
  const price = clamp01(num(currentPrice, num(position.entryPrice)));
  const knockout = num(position.knockoutPrice);
  const distance = position.side === "LONG" ? price - knockout : knockout - price;
  return Math.max(0, distance);
}

export interface LeverageTotals {
  /** Сколько позиций живо и сколько сгорело. */
  open: number;
  knockedOut: number;
  /** Маржа в живых позициях — это же и максимальный убыток по ним. */
  margin: number;
  /** Суммарная экспозиция живых позиций: маржа × плечо. */
  exposure: number;
  /** Заёмная часть экспозиции. */
  borrowed: number;
  /** Тариф, уплаченный вперёд по живым позициям. */
  tariff: number;
  unrealized: number;
  /** Что вернётся при закрытии всего: маржа + движение цены. */
  value: number;
  /** Маржа, потерянная на нокаутах. */
  knockedOutMargin: number;
}

/**
 * Сводка по плечевым позициям. `priceByTokenId` — текущие цены исходов; если
 * цены нет, берём цену входа (позиция показывается «в нуле»).
 */
export function leverageTotals(
  positions: Record<string, LeveragePosition> | LeveragePosition[],
  priceByTokenId: Record<string, number>,
): LeverageTotals {
  const list = Array.isArray(positions) ? positions : Object.values(positions ?? {});
  const totals: LeverageTotals = {
    open: 0,
    knockedOut: 0,
    margin: 0,
    exposure: 0,
    borrowed: 0,
    tariff: 0,
    unrealized: 0,
    value: 0,
    knockedOutMargin: 0,
  };

  for (const position of list) {
    if (!position) continue;
    const margin = Math.max(0, num(position.margin));

    if (position.knockedOutAt != null) {
      totals.knockedOut += 1;
      totals.knockedOutMargin += margin;
      continue;
    }

    const raw = priceByTokenId?.[position.tokenId];
    const price = Number.isFinite(raw) ? clamp01(num(raw)) : clamp01(num(position.entryPrice));
    const exposure = margin * Math.max(1, num(position.leverage, 1));

    totals.open += 1;
    totals.margin += margin;
    totals.exposure += exposure;
    totals.borrowed += Math.max(0, exposure - margin);
    totals.tariff += leveragePositionTariff(position);
    totals.unrealized += leveragePositionPnl(position, price);
  }

  // Тариф уже ушёл со счёта при открытии — в возврат он входит обратно,
  // иначе стоимость портфеля вычла бы его дважды.
  totals.value = Math.max(0, totals.margin + totals.unrealized + totals.tariff);
  return totals;
}
