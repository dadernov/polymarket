/**
 * Калибровка λ(d) и J(d) по ценовому ряду.
 *
 * Перенос `services/pipeline/calibrate.py` из бэкенда заказчика. Смысл величин:
 *   λ(d) — доля пошаговых изменений цены, пробивших барьер d (частота прыжка);
 *   J(d) — средний перелёт за барьер среди пробивших (насколько цена
 *          перескакивает уровень насквозь);
 *   λ·J  — ожидаемый убыток пула на позицию от таких прыжков. Именно он входит
 *          в гэп-премию тарифа.
 *
 * Зачем это на фронте. В бэкенде λ/J зашиты одной статической таблицей —
 * результатом калибровки на ОДНОМ биткоин-рынке; это ограничение заказчик
 * отмечает сам. Но история цен по каждому рынку у нас уже есть, а сама
 * калибровка — обычная статистика приращений. Поэтому мы считаем λ/J по
 * собственной истории конкретного рынка, а к статической таблице откатываемся,
 * когда данных мало.
 *
 * ВАЖНО про шаг ряда. λ — это доля шагов, пробивших барьер, поэтому она прямо
 * зависит от того, насколько редко взяты точки: на часовых шагах цена успевает
 * уйти дальше, чем на десятиминутных, и λ окажется завышенной. Эталонный ряд
 * заказчика снят с шагом ~600 секунд, поэтому и калибруем на сопоставимом шаге
 * (см. CALIBRATION_INTERVAL), иначе числа несравнимы с их таблицей.
 */

import type { ChartInterval, PricePoint } from "@/lib/types";
import {
  staticLambdaJSource,
  type LambdaJ,
  type LambdaJSource,
} from "./lambda-source";

/** Интервал истории, дающий шаг ~10 минут — сопоставимо с рядом заказчика. */
export const CALIBRATION_INTERVAL: ChartInterval = "1d";

/** Барьеры (в тиках), по которым строится таблица — те же, что в бэкенде. */
export const CALIBRATION_BARRIERS = [1, 2, 3, 5, 10] as const;

/** Меньше этого числа шагов — статистика не значима, калибровать нечего. */
export const MIN_STEPS = 120;

export interface CalibPoint {
  /** d — расстояние до нокаута в тиках. */
  barrier: number;
  /** λ(d) — частота пробоев, доля шагов. */
  lam: number;
  /** J(d) — средний перелёт за барьер. */
  overshoot: number;
  /** λ·J — ожидаемый убыток на позицию. */
  premium: number;
}

/**
 * Пошаговые изменения |Δ| в тиках.
 *
 * Порядок операций важен и повторяет бэкенд: сначала переводим цену в тики
 * (`load_csv` умножает на 100), и только потом берём разности. Обратный
 * порядок даёт другие λ и J: разность долей вида 0.77−0.76 в двоичной
 * арифметике равна 0.00999…, после умножения не дотягивает до барьера 1 и
 * пробой теряется. Произведение λ·J при этом совпадает — счётчик пробоев в
 * нём сокращается, — но сами λ и J расходятся, а они видны пользователю.
 */
export function stepChanges(points: PricePoint[]): number[] {
  const ticks = points.map((point) => point.p * 100);
  const changes: number[] = [];
  for (let i = 1; i < ticks.length; i++) {
    const delta = Math.abs(ticks[i] - ticks[i - 1]);
    if (Number.isFinite(delta)) changes.push(delta);
  }
  return changes;
}

/** Доля шагов, где |Δ| >= barrier. */
export function estimateLambda(changes: number[], barrier: number): number {
  if (!changes.length) return 0;
  let hits = 0;
  for (const c of changes) if (c >= barrier) hits++;
  return hits / changes.length;
}

/** Средний перелёт за барьер среди пробивших. Пробоев нет — перелёта нет. */
export function estimateOvershoot(changes: number[], barrier: number): number {
  let sum = 0;
  let count = 0;
  for (const c of changes) {
    if (c >= barrier) {
      sum += c - barrier;
      count++;
    }
  }
  return count === 0 ? 0 : sum / count;
}

/** Таблица λ/J/премии по набору барьеров. */
export function buildTable(
  changes: number[],
  barriers: readonly number[] = CALIBRATION_BARRIERS,
): CalibPoint[] {
  return barriers.map((barrier) => {
    const lam = estimateLambda(changes, barrier);
    const overshoot = estimateOvershoot(changes, barrier);
    return { barrier, lam, overshoot, premium: lam * overshoot };
  });
}

/**
 * Калибровка по истории цен рынка. Возвращает null, когда точек слишком мало:
 * вызывающий код в этом случае обязан взять статическую таблицу, а не
 * подставлять шум вместо статистики.
 */
export function calibrateFromHistory(points: PricePoint[]): CalibPoint[] | null {
  const changes = stepChanges(points);
  if (changes.length < MIN_STEPS) return null;
  return buildTable(changes);
}

/**
 * Источник λ/J по собственной калибровке рынка. Реализует тот же интерфейс,
 * что и статическая таблица, поэтому подставляется в тариф без его правки —
 * ровно та подмена, под которую шов и делался.
 *
 * Выбор строки — ближайший барьер, как в бэкенде; ничья решается в пользу
 * меньшего барьера (там `min` возвращает первый из равных).
 */
export function createCalibratedSource(table: CalibPoint[]): LambdaJSource {
  return {
    lookup(barrier: number): LambdaJ {
      const d = Number.isFinite(barrier) ? Math.abs(barrier) : 0;
      let best = table[0];
      let bestGap = Math.abs(best.barrier - d);
      for (const row of table) {
        const gap = Math.abs(row.barrier - d);
        if (gap < bestGap) {
          best = row;
          bestGap = gap;
        }
      }
      return { lambda: best.lam, j: best.overshoot };
    },
  };
}

/**
 * Источник, берущий более пессимистичную из двух калибровок.
 *
 * Зачем так. Наблюдение «за сутки цена не прыгнула» НЕ означает «прыжков не
 * бывает»: спокойный рынок выборов даёт λ = 0 на всех барьерах, и наивная
 * подстановка обнулила бы гэп-премию — платформа перестала бы брать плату за
 * риск ровно там, где он просто не реализовался в окне наблюдения. Поэтому
 * эталонная калибровка работает нижней границей: на каждом барьере берём ту
 * пару (λ, J), у которой произведение больше. Возвращается всегда настоящая
 * пара из одной из калибровок, а не сконструированная.
 */
function createConservativeSource(
  market: LambdaJSource,
  reference: LambdaJSource,
): LambdaJSource {
  return {
    lookup(barrier: number): LambdaJ {
      const a = market.lookup(barrier);
      const b = reference.lookup(barrier);
      return a.lambda * a.j >= b.lambda * b.j ? a : b;
    },
  };
}

export interface ResolvedLambdaSource {
  source: LambdaJSource;
  /**
   * Откуда взялись числа — это видно пользователю в разборе тарифа.
   * `market` — калибровка по этому рынку (не ниже эталона), `static` — эталон.
   */
  origin: "market" | "static";
  /** Сколько шагов легло в калибровку; у статической таблицы — null. */
  steps: number | null;
}

/**
 * Источник λ/J для конкретного рынка: своя калибровка, если история достаточна
 * и в ней вообще были пробои, иначе — эталонная таблица заказчика. Происхождение
 * возвращается наружу: подставлять чужую калибровку молча нельзя, пользователь
 * должен видеть, посчитан риск по этому рынку или взят с эталонного.
 */
export function resolveLambdaSource(
  points: PricePoint[] | undefined,
): ResolvedLambdaSource {
  const table = points ? calibrateFromHistory(points) : null;
  // Ни одного пробоя даже на минимальном барьере — статистики о прыжках нет,
  // и выдавать её за «риска нет» нельзя.
  const informative = table?.some((row) => row.premium > 0) ?? false;
  if (!table || !informative) {
    return { source: staticLambdaJSource, origin: "static", steps: null };
  }
  return {
    source: createConservativeSource(
      createCalibratedSource(table),
      staticLambdaJSource,
    ),
    origin: "market",
    steps: stepChanges(points ?? []).length,
  };
}
