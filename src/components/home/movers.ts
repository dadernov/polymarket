import type { MarketEvent } from "@/lib/types";

/**
 * Отбор суточных движений. Модуль намеренно отделён от <MoversRail/>: сама
 * лента клиентская (прокрутка колесом и подсказки о краях), а эти функции
 * вызывает серверная страница — из «use client»-модуля RSC отдал бы вместо
 * них ссылки на клиент.
 */

/** Сколько плашек держим в ленте: дальше листать перестают. */
const MOVERS_LIMIT = 8;

/** Ниже этого порога «движение» — округление, а не новость. */
const MIN_CHANGE = 0.005;

/** Подписи, которые ничего не добавляют к числу. */
const IMPLICIT_YES = new Set(["yes", "да", "up", "over"]);

export interface Mover {
  event: MarketEvent;
  /** Токен движущегося исхода — для ряда цен. */
  tokenId: string | null;
  /** Текущая вероятность исхода, 0..1. */
  price: number;
  /** Изменение за сутки в долях (0.05 = +5 п.п.). */
  change: number;
  /** Чей это исход, если название что-то говорит: имя кандидата, порог. */
  label: string | null;
}

export interface PickMoversOptions {
  /** Событие, уже показанное крупно: в ленте оно было бы повтором. */
  exclude?: string;
  limit?: number;
  minChange?: number;
}

/**
 * События, у которых вероятность за сутки сдвинулась сильнее всего.
 *
 * Дельта берётся у первого рынка события, и это корректно только там, где
 * рынки взаимоисключающие: у набора независимых ставок «изменения события»
 * не существует — двигаться могут разные вопросы в разные стороны. Такие
 * события в ленту не попадают вовсе, вместо того чтобы попасть с неверным
 * числом.
 */
export function pickMovers(
  events: MarketEvent[],
  options: PickMoversOptions = {},
): Mover[] {
  const { exclude, limit = MOVERS_LIMIT, minChange = MIN_CHANGE } = options;
  const movers: Mover[] = [];

  for (const event of events) {
    if (event.id === exclude || event.closed) continue;
    if (!(event.exclusive || event.markets.length === 1)) continue;

    const market = event.markets[0];
    if (!market || market.closed || !market.acceptingOrders) continue;

    const outcome = market.outcomes[0];
    if (!outcome) continue;
    // Рынок с ценой на границе уже фактически решён — его «движение» ничего
    // не сообщает о будущем.
    if (outcome.price <= 0 || outcome.price >= 1) continue;

    const change = market.oneDayPriceChange;
    if (!Number.isFinite(change) || Math.abs(change) < minChange) continue;

    const named =
      market.groupTitle ??
      (IMPLICIT_YES.has(outcome.label.trim().toLowerCase()) ? null : outcome.label);

    movers.push({
      event,
      tokenId: outcome.tokenId,
      price: outcome.price,
      change,
      label: named,
    });
  }

  movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return movers.slice(0, limit);
}

/** Токены ленты — страница запрашивает ряды цен одним пакетом. */
export function moverTokenIds(movers: Mover[]): string[] {
  const ids: string[] = [];
  for (const mover of movers) if (mover.tokenId) ids.push(mover.tokenId);
  return ids;
}
