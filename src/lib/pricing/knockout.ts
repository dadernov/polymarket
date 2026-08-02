/**
 * Нокаут-калькулятор плечевого слоя. Порт services/leverage/knockout.py
 * один-в-один по формулам.
 *
 * По (направление, цена входа, плечо, маржа) считает:
 *   - уровень нокаута (тик), где позиция гаснет;
 *   - размер позиции size (units);
 *   - макс. убыток игрока (= маржа по построению);
 *   - макс. выплату пула (его обязательство).
 *
 * Цена — в целых тиках (0..100). Деньги ($) — производные, float.
 *
 * Функции бросают `LeverageError`: это внутренний слой, наружу ошибки
 * переводит `quoteLeverage` из ./leverage.
 */

import { ONE, roundHalfEven } from "./ticks";

/** Потолок плеча. Их модель авторитетна: динамического максимума нет. */
export const MAX_LEVERAGE = 5;

/** Плечо строго больше единицы — ровно 1 их проверка не пропускает. */
export const MIN_LEVERAGE_EXCLUSIVE = 1;

export const LONG = "LONG";
export const SHORT = "SHORT";

export type Direction = typeof LONG | typeof SHORT;

/** Код причины отказа — UI переводит его сам, не разбирая текст. */
export type LeverageErrorCode =
  | "direction"
  | "leverage_range"
  | "entry_range"
  | "margin"
  | "knockout_equals_entry";

export class LeverageError extends Error {
  readonly code: LeverageErrorCode;

  constructor(code: LeverageErrorCode, message: string) {
    super(message);
    this.name = "LeverageError";
    this.code = code;
  }
}

export interface Position {
  direction: Direction;
  marketId: string;
  /** Цена входа в тиках, 0 < entry < 100. */
  entry: number;
  leverage: number;
  margin: number;
  /** Тик, на котором позиция гаснет. */
  knockout: number;
  /** Размер позиции в юнитах. */
  size: number;
  /** По построению равен марже. */
  maxLoss: number;
  /** Обязательство пула по этой позиции. */
  maxPayout: number;
}

export interface OpenPositionArgs {
  direction: Direction;
  marketId: string;
  /** Цена входа в ТИКАХ. */
  entry: number;
  leverage: number;
  margin: number;
}

export function openPosition({
  direction,
  marketId,
  entry,
  leverage,
  margin,
}: OpenPositionArgs): Position {
  if (direction !== LONG && direction !== SHORT) {
    throw new LeverageError("direction", "direction must be LONG or SHORT");
  }
  if (!(leverage > MIN_LEVERAGE_EXCLUSIVE && leverage <= MAX_LEVERAGE)) {
    throw new LeverageError(
      "leverage_range",
      `leverage must be in (${MIN_LEVERAGE_EXCLUSIVE}, ${MAX_LEVERAGE}]`,
    );
  }
  if (!(Number.isInteger(entry) && entry > 0 && entry < ONE)) {
    throw new LeverageError("entry_range", "entry must be strictly between 0 and 100 ticks");
  }
  if (!(margin > 0)) {
    throw new LeverageError("margin", "margin must be positive");
  }

  const p0 = entry / ONE; // цена входа в долларах, 0..1

  let dist: number;
  let koPrice: number;
  let size: number;
  let maxPayout: number;

  if (direction === LONG) {
    dist = p0 / leverage;
    koPrice = p0 - dist;
    size = (margin * leverage) / p0;
    maxPayout = size * (1 - p0);
  } else {
    dist = (1 - p0) / leverage;
    koPrice = p0 + dist;
    size = (margin * leverage) / (1 - p0);
    maxPayout = size * p0;
  }

  let knockout = roundHalfEven(koPrice * ONE);
  if (knockout === entry) {
    throw new LeverageError(
      "knockout_equals_entry",
      "плечо слишком велико для этого входа: нокаут совпал со входом",
    );
  }
  knockout = Math.max(0, Math.min(ONE, knockout));

  const maxLoss = size * dist; // по построению = margin

  return { direction, marketId, entry, leverage, margin, knockout, size, maxLoss, maxPayout };
}

/** Позиция гаснет при касании нокаут-уровня. Сравнение целочисленное, в тиках. */
export function isKnockedOut(pos: Position, price: number): boolean {
  if (pos.direction === LONG) return price <= pos.knockout;
  return price >= pos.knockout;
}
