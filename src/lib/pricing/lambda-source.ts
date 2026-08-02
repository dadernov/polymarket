/**
 * Шов под калибровку λ/J. Порт services/leverage/lambda_source.py.
 *
 * Тариф зависит от ИНТЕРФЕЙСА, а не от того, откуда взялись числа. Сегодня —
 * статическая таблица с данными их реальной калибровки Bitcoin-рынка, завтра —
 * массовая калибровка с сервера. Формула тарифа при подмене не меняется.
 *
 * λ — интенсивность прыжков через барьер, J — средний размер прыжка в тиках.
 * Их произведение — ожидаемый перелёт за нокаут, который оплачивает гэп-премия.
 */

export interface LambdaJ {
  /** Интенсивность прыжков через барьер. */
  lambda: number;
  /** Средний размер прыжка, тиков. */
  j: number;
}

/** Любой источник λ/J реализует этот метод. Тариф знает только его. */
export interface LambdaJSource {
  /** Вернуть λ/J для барьера d (тиков) — расстояния от входа до нокаута. */
  lookup(barrier: number): LambdaJ;
}

/** Калибровка с живых данных: барьер (тиков) → λ, J. Порядок значим (см. ниже). */
export const LAMBDA_J_TABLE: readonly (LambdaJ & { barrier: number })[] = [
  { barrier: 1, lambda: 0.467, j: 1.384 },
  { barrier: 2, lambda: 0.193, j: 2.166 },
  { barrier: 3, lambda: 0.107, j: 2.836 },
  { barrier: 5, lambda: 0.042, j: 4.511 },
  { barrier: 10, lambda: 0.009, j: 11.217 },
];

/**
 * PoC-заглушка: берём ближайший откалиброванный барьер.
 * Ничья решается в пользу МЕНЬШЕГО барьера — так же, как `min(..., key=...)`
 * в Python возвращает первый элемент из равных.
 */
export class StaticLambdaJSource implements LambdaJSource {
  lookup(barrier: number): LambdaJ {
    const d = Number.isFinite(barrier) ? Math.abs(barrier) : 0;
    let best = LAMBDA_J_TABLE[0];
    let bestGap = Math.abs(best.barrier - d);
    for (const row of LAMBDA_J_TABLE) {
      const gap = Math.abs(row.barrier - d);
      if (gap < bestGap) {
        best = row;
        bestGap = gap;
      }
    }
    return { lambda: best.lambda, j: best.j };
  }
}

/** Готовый экземпляр — тариф по умолчанию берёт его. */
export const staticLambdaJSource: LambdaJSource = new StaticLambdaJSource();
