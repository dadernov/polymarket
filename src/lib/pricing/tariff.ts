/**
 * Тарифный модуль: цена за риск плечевой позиции.
 * Порт services/leverage/tariff.py.
 *
 *   тариф = стоимость капитала + гэп-премия(λ·J·запас) + маржа платформы
 *
 * λ/J приходят через `LambdaJSource` (шов), поэтому подмена калибровки
 * не трогает формулу.
 */

import type { Position } from "./knockout";
import type { LambdaJSource } from "./lambda-source";

export interface TariffConfig {
  /** Стоимость капитала: доля от обязательства пула. */
  capitalRate: number;
  /** Маржа платформы: доля от маржи игрока. */
  platformFee: number;
  /** Запас поверх λ·J — плата за неопределённость калибровки. */
  gapBuffer: number;
  /** $ за 1 тик. */
  tickValue: number;
}

export const DEFAULT_TARIFF: TariffConfig = {
  capitalRate: 0.02,
  platformFee: 0.015,
  gapBuffer: 1.5,
  tickValue: 0.01,
};

export interface TariffBreakdown {
  /** $ за замороженный капитал пула. */
  capitalCost: number;
  /** $ ожидаемого убытка от прыжков цены + запас. */
  gapPremium: number;
  /** $ заработок платформы. */
  platformCost: number;
  /** $ итого с игрока. */
  total: number;
  /** % от маржи. */
  totalPct: number;
}

/** Пустой разбор — для котировки с ошибкой, чтобы в UI не было NaN. */
export const EMPTY_TARIFF: TariffBreakdown = {
  capitalCost: 0,
  gapPremium: 0,
  platformCost: 0,
  total: 0,
  totalPct: 0,
};

/** Расстояние от входа до нокаута в тиках — это d для калибровки λ/J. */
export function barrierTicks(pos: Position): number {
  return Math.abs(pos.entry - pos.knockout);
}

/** Собрать тариф из трёх слагаемых для конкретной позиции. */
export function pricePosition(
  pos: Position,
  source: LambdaJSource,
  cfg: TariffConfig = DEFAULT_TARIFF,
): TariffBreakdown {
  // 1) стоимость капитала: пул морозит обязательство (maxPayout)
  const capitalCost = pos.maxPayout * cfg.capitalRate;

  // 2) гэп-премия: λ·J на нокаут-барьере — ожидаемый перелёт в тиках;
  //    переводим в $ через размер позиции и цену тика, сверху запас.
  const { lambda, j } = source.lookup(barrierTicks(pos));
  const expectedOvershootTicks = lambda * j;
  const gapPremium = expectedOvershootTicks * cfg.tickValue * pos.size * cfg.gapBuffer;

  // 3) маржа платформы: доля от маржи игрока
  const platformCost = pos.margin * cfg.platformFee;

  const total = capitalCost + gapPremium + platformCost;

  return {
    capitalCost,
    gapPremium,
    platformCost,
    total,
    totalPct: (total / pos.margin) * 100,
  };
}

/** Округление под показ — аналог их `TariffBreakdown.as_dict()`. */
export function roundTariff(b: TariffBreakdown): TariffBreakdown {
  const r = (v: number, digits: number): number => {
    const k = 10 ** digits;
    return Math.round(v * k) / k;
  };
  return {
    capitalCost: r(b.capitalCost, 4),
    gapPremium: r(b.gapPremium, 4),
    platformCost: r(b.platformCost, 4),
    total: r(b.total, 4),
    totalPct: r(b.totalPct, 2),
  };
}
