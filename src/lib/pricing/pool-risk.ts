/**
 * Риск-движок пула: неттинг лонг/шорт и лимиты на приём позиций.
 * Порт services/leverage/pool_risk.py.
 *
 * Лимиты — в терминах МАКСИМАЛЬНОЙ ВЫПЛАТЫ (обязательства пула), а не
 * номинала. Три уровня: на рынок, на кластер коррелированных рынков, на весь
 * пул. Off-chain-логика «предлагает»; в контракте эти лимиты станут
 * инвариантами.
 */

import { LONG, type Position } from "./knockout";
import { roundHalfEven } from "./ticks";

export interface PoolLimits {
  /** Весь капитал пула, $. */
  capital: number;
  /** ≤3% капитала на один рынок. */
  perMarket: number;
  /** ≤10% на кластер коррелированных рынков. */
  perCluster: number;
  /** ≤30% суммарно по всему пулу. */
  globalStress: number;
}

export const DEFAULT_POOL_SHARES = {
  perMarket: 0.03,
  perCluster: 0.1,
  globalStress: 0.3,
} as const;

/** Лимиты с их долями по умолчанию. */
export function poolLimits(capital: number, overrides?: Partial<PoolLimits>): PoolLimits {
  return { capital, ...DEFAULT_POOL_SHARES, ...overrides };
}

/** Обязательства пула по одному рынку, разбитые на лонг/шорт. */
export class Exposure {
  /** Сумма maxPayout лонгов. */
  longPayout: number;
  /** Сумма maxPayout шортов. */
  shortPayout: number;

  constructor(longPayout = 0, shortPayout = 0) {
    this.longPayout = longPayout;
    this.shortPayout = shortPayout;
  }

  /** Чистый перекос = |лонги − шорты|. Это и есть риск пула по рынку. */
  get net(): number {
    return Math.abs(this.longPayout - this.shortPayout);
  }
}

/** Вердикт по позиции: можно ли принять и почему нет. */
export interface PoolVerdict {
  ok: boolean;
  reason: string;
}

export class PoolRiskEngine {
  readonly limits: PoolLimits;
  /** marketId → clusterId. Нет записи — рынок сам себе кластер. */
  readonly clusters: Record<string, string>;
  readonly exposure: Map<string, Exposure>;

  constructor(limits: PoolLimits, clusters?: Record<string, string>) {
    this.limits = limits;
    this.clusters = clusters ?? {};
    this.exposure = new Map();
  }

  private clusterOf(marketId: string): string {
    return this.clusters[marketId] ?? marketId;
  }

  /** Копия экспозиции рынка с добавленной позицией — для проверки ДО принятия. */
  private withAdded(pos: Position): Exposure {
    const cur = this.exposure.get(pos.marketId) ?? new Exposure();
    const next = new Exposure(cur.longPayout, cur.shortPayout);
    if (pos.direction === LONG) next.longPayout += pos.maxPayout;
    else next.shortPayout += pos.maxPayout;
    return next;
  }

  /** Таблица экспозиций с наложенным пробным изменением. */
  private table(override?: Map<string, Exposure>): Map<string, Exposure> {
    if (!override) return this.exposure;
    const merged = new Map(this.exposure);
    for (const [id, exp] of override) merged.set(id, exp);
    return merged;
  }

  /** Суммарный чистый риск по кластеру (сумма перекосов его рынков). */
  netCluster(clusterId: string, override?: Map<string, Exposure>): number {
    let total = 0;
    for (const [marketId, exp] of this.table(override)) {
      if (this.clusterOf(marketId) === clusterId) total += exp.net;
    }
    return total;
  }

  /** Суммарный чистый риск по всему пулу. */
  netGlobal(override?: Map<string, Exposure>): number {
    let total = 0;
    for (const exp of this.table(override).values()) total += exp.net;
    return total;
  }

  /**
   * Проверить, можно ли принять позицию, НЕ меняя состояние.
   * Проверяет все три лимита и возвращает причину отказа.
   */
  canAccept(pos: Position): PoolVerdict {
    const trial = this.withAdded(pos);
    const override = new Map([[pos.marketId, trial]]);
    const cap = this.limits.capital;

    // 1) лимит на рынок
    const marketCap = cap * this.limits.perMarket;
    if (trial.net > marketCap) {
      return {
        ok: false,
        reason: `per_market: перекос ${roundHalfEven(trial.net)} > лимит ${roundHalfEven(marketCap)}`,
      };
    }

    // 2) лимит на кластер
    const cluster = this.clusterOf(pos.marketId);
    if (this.netCluster(cluster, override) > cap * this.limits.perCluster) {
      return { ok: false, reason: "per_cluster: превышен лимит кластера" };
    }

    // 3) глобальный лимит
    if (this.netGlobal(override) > cap * this.limits.globalStress) {
      return { ok: false, reason: "global_stress: превышен глобальный лимит" };
    }

    return { ok: true, reason: "ok" };
  }

  /** Принять позицию — обновить экспозицию рынка. Зовётся ПОСЛЕ canAccept. */
  accept(pos: Position): void {
    const verdict = this.canAccept(pos);
    if (!verdict.ok) throw new Error(`позиция отклонена: ${verdict.reason}`);

    const cur = this.exposure.get(pos.marketId) ?? new Exposure();
    if (pos.direction === LONG) cur.longPayout += pos.maxPayout;
    else cur.shortPayout += pos.maxPayout;
    this.exposure.set(pos.marketId, cur);
  }
}
