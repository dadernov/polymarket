/**
 * TWAP-оракул: время-взвешенная средняя цена за окно.
 * Порт services/oracle/twap.py.
 *
 * Идея: цена держится на уровне p от момента t0 до следующего обновления t1.
 * Вклад отрезка в среднее = p · (t1 − t0). Сумма вкладов / общее время = TWAP.
 * Мгновенный шип (короткий отрезок) почти не двигает среднее за 30 минут —
 * поэтому нокаут проверяют по TWAP, а не по последней цене: сбить его
 * секундной манипуляцией нельзя.
 *
 * Цена — в целых тиках (0..100), как везде. Время — в секундах.
 */

import { roundHalfEven } from "@/lib/pricing/ticks";

export interface Sample {
  /** Временная метка, секунды. */
  ts: number;
  /** Цена в тиках. */
  price: number;
}

/** Окно по умолчанию — 30 минут. */
export const DEFAULT_TWAP_WINDOW_SEC = 1800;

export class TWAP {
  readonly window: number;
  readonly samples: Sample[] = [];

  constructor(windowSec: number = DEFAULT_TWAP_WINDOW_SEC) {
    this.window = windowSec;
  }

  /** Добавить наблюдение. Метки должны идти по неубыванию времени. */
  add(ts: number, price: number): void {
    const last = this.samples[this.samples.length - 1];
    if (last && ts < last.ts) throw new Error("временная метка в прошлом");
    this.samples.push({ ts, price });
    this.evict(ts);
  }

  /** Убрать наблюдения старше окна, оставив одно «якорное» перед границей. */
  private evict(now: number): void {
    const cutoff = now - this.window;
    // держим одно наблюдение слева от cutoff, чтобы знать цену на начало окна
    while (this.samples.length >= 2 && this.samples[1].ts <= cutoff) {
      this.samples.shift();
    }
  }

  /**
   * TWAP на момент now за окно [now − window, now].
   * Возвращает тик (округлённо) или null, если данных нет.
   */
  value(now: number): number | null {
    if (this.samples.length === 0) return null;
    if (this.samples.length === 1) return this.samples[0].price; // одна точка — она и есть цена

    const start = now - this.window;
    let weightedSum = 0;
    let totalTime = 0;

    // идём по парам соседних наблюдений: отрезок [s.ts, next.ts] держит цену s.price
    for (let i = 0; i < this.samples.length - 1; i += 1) {
      const s = this.samples[i];
      const next = this.samples[i + 1];
      const segStart = Math.max(s.ts, start); // обрезаем отрезок слева границей окна
      const segEnd = next.ts;
      if (segEnd <= segStart) continue;
      const dt = segEnd - segStart;
      weightedSum += s.price * dt;
      totalTime += dt;
    }

    // последний отрезок: от последнего наблюдения до now держим последнюю цену
    const last = this.samples[this.samples.length - 1];
    const tailStart = Math.max(last.ts, start);
    if (now > tailStart) {
      const dt = now - tailStart;
      weightedSum += last.price * dt;
      totalTime += dt;
    }

    if (totalTime === 0) return last.price;
    return roundHalfEven(weightedSum / totalTime);
  }
}
