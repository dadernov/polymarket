/**
 * Тиковая модель цены — общий язык всего плечевого слоя.
 *
 * У бэкенда цена живёт в ЦЕЛЫХ тиках 0..100 ($1.00 = 100 тиков), а деньги —
 * во float. Polymarket отдаёт доли вида 0.9995, поэтому граница «фронт → их
 * математика» проходит здесь: цена округляется к тику, и дальше формулы
 * работают только с целыми.
 *
 * Округление — половина к чётному (round half to even), как у `round()` в
 * Python. Это не педантизм: их эталон даёт для входа 73 при плече 2 нокаут
 * 36, а не 37 — ровно потому, что 36.5 округляется вниз.
 */

/** $1.00 в тиках. Цена исхода лежит в 0..100. */
export const ONE = 100;

/** Цена одного тика в долларах. */
export const TICK_SIZE = 1 / ONE;

/**
 * Округление половины к чётному — поведение `round()` из Python.
 * Math.round округляет .5 всегда вверх и разъезжается с эталоном.
 */
export function roundHalfEven(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const low = Math.floor(value);
  const frac = value - low;
  if (frac > 0.5) return low + 1;
  if (frac < 0.5) return low;
  return low % 2 === 0 ? low : low + 1;
}

/** Загнать тик в допустимый диапазон 0..100. */
export function clampTicks(ticks: number): number {
  if (!Number.isFinite(ticks)) return 0;
  return Math.min(ONE, Math.max(0, Math.trunc(ticks)));
}

/** Цена 0..1 → тик 0..100. Мусор на входе даёт 0. */
export function priceToTicks(price: number): number {
  if (!Number.isFinite(price)) return 0;
  return clampTicks(roundHalfEven(price * ONE));
}

/** Тик 0..100 → цена 0..1. */
export function ticksToPrice(ticks: number): number {
  return clampTicks(ticks) / ONE;
}

/**
 * Годится ли тик как цена ВХОДА. Их правило жёсткое: строго 0 < entry < 100.
 * Тик 0 или 100 — рынок фактически определился, плечо на нём невозможно.
 */
export function isEntryTick(ticks: number): boolean {
  return Number.isInteger(ticks) && ticks > 0 && ticks < ONE;
}
