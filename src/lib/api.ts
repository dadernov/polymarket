/**
 * Клиентский слой доступа к данным: тонкие фетчеры к нашим `/api/*` и
 * готовые ключи для React Query. Компоненты не ходят в Polymarket напрямую.
 */

import type {
  ChartInterval,
  HolderGroup,
  LeaderboardEntry,
  LeaderboardType,
  LeaderboardWindow,
  MarketEvent,
  OrderBook,
  Paginated,
  PricePoint,
  SparklineMap,
  Tag,
  Trade,
} from "./types";

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${detail.slice(0, 160)}`);
  }
  return (await res.json()) as T;
}

export interface EventsParams {
  tag?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  closed?: boolean;
  q?: string;
}

export function eventsPath(params: EventsParams = {}): string {
  const search = new URLSearchParams();
  if (params.tag && params.tag !== "all") search.set("tag", params.tag);
  if (params.sort) search.set("sort", params.sort);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  if (params.closed) search.set("closed", "true");
  if (params.q) search.set("q", params.q);
  const qs = search.toString();
  return `/api/events${qs ? `?${qs}` : ""}`;
}

/**
 * Набор токенов, а не список: дубликаты убраны, порядок фиксирован.
 * Иначе один и тот же экран даёт разные ключи и URL на каждый ре-рендер.
 */
function tokenSet(tokenIds: string[]): string[] {
  return [...new Set(tokenIds.filter(Boolean))].sort();
}

export const api = {
  events: (params: EventsParams = {}, signal?: AbortSignal) =>
    getJSON<Paginated<MarketEvent>>(eventsPath(params), signal),

  event: (slug: string, signal?: AbortSignal) =>
    getJSON<MarketEvent>(`/api/events/${encodeURIComponent(slug)}`, signal),

  tags: (signal?: AbortSignal) => getJSON<Tag[]>("/api/tags", signal),

  search: (q: string, signal?: AbortSignal) =>
    getJSON<{ events: MarketEvent[]; tags: Tag[] }>(
      `/api/search?q=${encodeURIComponent(q)}`,
      signal,
    ),

  priceHistory: (tokenId: string, interval: ChartInterval, signal?: AbortSignal) =>
    getJSON<PricePoint[]>(
      `/api/price-history?tokenId=${tokenId}&interval=${interval}`,
      signal,
    ),

  book: (tokenId: string, signal?: AbortSignal) =>
    getJSON<OrderBook>(`/api/book?tokenId=${tokenId}`, signal),

  /** Пакетом на весь видимый список — по запросу на карточку апстрим не выдержит. */
  sparklines: (tokenIds: string[], signal?: AbortSignal): Promise<SparklineMap> => {
    const ids = tokenSet(tokenIds);
    if (!ids.length) return Promise.resolve({});
    return getJSON<SparklineMap>(`/api/sparklines?tokenIds=${ids.join(",")}`, signal);
  },

  trades: (
    params: { conditionId?: string; user?: string; limit?: number; minAmount?: number },
    signal?: AbortSignal,
  ) => {
    const search = new URLSearchParams();
    if (params.conditionId) search.set("conditionId", params.conditionId);
    if (params.user) search.set("user", params.user);
    if (params.limit) search.set("limit", String(params.limit));
    if (params.minAmount) search.set("minAmount", String(params.minAmount));
    return getJSON<Trade[]>(`/api/trades?${search}`, signal);
  },

  holders: (conditionId: string, marketId?: string, signal?: AbortSignal) =>
    getJSON<HolderGroup[]>(
      `/api/holders?conditionId=${conditionId}${marketId ? `&marketId=${marketId}` : ""}`,
      signal,
    ),

  leaderboard: (
    type: LeaderboardType,
    window: LeaderboardWindow,
    signal?: AbortSignal,
  ) =>
    getJSON<LeaderboardEntry[]>(
      `/api/leaderboard?type=${type}&window=${window}`,
      signal,
    ),
};

/** Ключи React Query — в одном месте, чтобы инвалидация не разъезжалась. */
export const queryKeys = {
  events: (params: EventsParams) => ["events", params] as const,
  event: (slug: string) => ["event", slug] as const,
  tags: () => ["tags"] as const,
  search: (q: string) => ["search", q] as const,
  priceHistory: (tokenId: string, interval: ChartInterval) =>
    ["price-history", tokenId, interval] as const,
  book: (tokenId: string) => ["book", tokenId] as const,
  sparklines: (tokenIds: string[]) =>
    ["sparklines", tokenSet(tokenIds).join(",")] as const,
  trades: (params: Record<string, unknown>) => ["trades", params] as const,
  holders: (conditionId: string) => ["holders", conditionId] as const,
  leaderboard: (type: string, window: string) =>
    ["leaderboard", type, window] as const,
};

/** Как часто обновляем «живые» данные (мс). */
export const REFRESH = {
  book: 4_000,
  prices: 15_000,
  trades: 10_000,
  events: 30_000,
} as const;
