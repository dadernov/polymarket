/**
 * Маркет-мейкер Хэнсона (LMSR). Порт services/robot/lmsr.py один-в-один.
 *
 *   C(q) = b · ln( e^(q_yes/b) + e^(q_no/b) )
 *   цена ДА = 1 / (1 + e^(−(q_yes − q_no)/b))
 *
 * Смысл функции стоимости появляется в РАЗНОСТИ: цена покупки = C(после) − C(до).
 * Поэтому крупная заявка стоит дороже, чем «цена × объём», — цена растёт по
 * ходу исполнения.
 */

/** Цену держим в коридоре: ровно 0 или 1 = робот берёт риск бесплатно. */
export const PRICE_FLOOR = 0.001;
export const PRICE_CEIL = 0.999;

export type LmsrOutcome = "YES" | "NO";

/** Порог, за которым exp() уходит в переполнение или в ноль. */
const EXP_LIMIT = 700;

export class LMSR {
  /** Глубина/риск: макс. убыток ограничен b · ln 2. */
  b: number;
  /** Всего куплено билетов ДА. */
  qYes: number;
  /** Всего куплено билетов НЕТ. */
  qNo: number;

  constructor(b: number, qYes = 0, qNo = 0) {
    this.b = b;
    this.qYes = qYes;
    this.qNo = qNo;
  }

  /**
   * «Сколько денег в системе» при текущих счётчиках.
   * Устойчивая версия: выносим максимум за логарифм, иначе e^x взрывается на
   * больших q. Тождество: ln(e^a + e^c) = m + ln(e^(a−m) + e^(c−m)), m = max(a, c).
   */
  cost(): number {
    const a1 = this.qYes / this.b;
    const a2 = this.qNo / this.b;
    const m = Math.max(a1, a2);
    return this.b * (m + Math.log(Math.exp(a1 - m) + Math.exp(a2 - m)));
  }

  /** Мгновенная цена ДА, зажатая в коридор. */
  priceYes(): number {
    const net = (this.qYes - this.qNo) / this.b;
    let p: number;
    if (net > EXP_LIMIT) p = 1;
    else if (net < -EXP_LIMIT) p = 0;
    else p = 1 / (1 + Math.exp(-net));
    return Math.min(Math.max(p, PRICE_FLOOR), PRICE_CEIL);
  }

  /** Цена НЕТ. По построению p_yes + p_no = 1 — тождество ДА+НЕТ = $1. */
  priceNo(): number {
    return 1 - this.priceYes();
  }

  /** Честная стоимость покупки qty билетов: C(после) − C(до). */
  buyCost(outcome: LmsrOutcome, qty: number): number {
    const before = this.cost();
    let after: number;
    if (outcome === "YES") after = new LMSR(this.b, this.qYes + qty, this.qNo).cost();
    else if (outcome === "NO") after = new LMSR(this.b, this.qYes, this.qNo + qty).cost();
    else throw new Error("outcome must be 'YES' or 'NO'");
    return after - before;
  }

  /** Зафиксировать покупку: сдвинуть счётчики, цены пересчитаются сами. */
  apply(outcome: LmsrOutcome, qty: number): void {
    if (outcome === "YES") this.qYes += qty;
    else if (outcome === "NO") this.qNo += qty;
    else throw new Error("outcome must be 'YES' or 'NO'");
  }

  /**
   * Верхняя граница убытка робота за всё время жизни рынка: b · ln 2.
   * Не зависит от того, как торговали, — только от b. Это сумма, которую
   * платформа осознанно кладёт на раскрутку рынка.
   */
  maxLoss(): number {
    return this.b * Math.LN2;
  }
}
