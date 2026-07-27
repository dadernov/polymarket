/**
 * Серверный клиент публичных API Polymarket.
 *
 * Модуль вызывается только из route handlers и server components: браузер
 * ходит в наши `/api/*`, а не напрямую в Polymarket (обходим CORS, держим
 * кэш на своей стороне и нормализуем данные в одном месте).
 */

import type {
  ChartInterval,
  EventQuery,
  Holder,
  HolderGroup,
  LeaderboardEntry,
  LeaderboardType,
  LeaderboardWindow,
  Market,
  MarketEvent,
  OrderBook,
  Outcome,
  Paginated,
  PricePoint,
  RawGammaEvent,
  RawGammaMarket,
  RawGammaTag,
  SparklineMap,
  Tag,
  Trade,
} from "./types";

export const GAMMA = "https://gamma-api.polymarket.com";
export const CLOB = "https://clob.polymarket.com";
export const DATA = "https://data-api.polymarket.com";
export const LEADERBOARD = "https://lb-api.polymarket.com";

/** Ошибка апстрима с сохранённым HTTP-статусом — route handler его пробрасывает. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

interface FetchOptions {
  /** Время жизни кэша Next.js в секундах. */
  revalidate?: number;
  method?: "GET" | "POST";
  body?: unknown;
}

async function request<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const { revalidate = 30, method = "GET", body } = options;

  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    next: { revalidate },
  });

  if (!res.ok) {
    throw new UpstreamError(`Upstream ${res.status} ${res.statusText}`, res.status, url);
  }
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ */
/* Нормализация                                                        */
/* ------------------------------------------------------------------ */

/** Gamma кладёт массивы в строку — разбираем безопасно. */
function parseJsonArray(value: string | undefined | null): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number.parseFloat(value) : (value as number);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeOutcomes(raw: RawGammaMarket): Outcome[] {
  const labels = parseJsonArray(raw.outcomes).map(String);
  const prices = parseJsonArray(raw.outcomePrices).map((p) => toNumber(p));
  const tokenIds = parseJsonArray(raw.clobTokenIds).map(String);

  // У бинарных рынков без явных исходов Gamma иногда отдаёт пустой массив.
  if (labels.length === 0) {
    const price = toNumber(raw.lastTradePrice ?? raw.bestBid, 0.5);
    return [
      { index: 0, label: "Yes", price, tokenId: tokenIds[0] ?? null },
      { index: 1, label: "No", price: 1 - price, tokenId: tokenIds[1] ?? null },
    ];
  }

  return labels.map((label, index) => ({
    index,
    label,
    price: prices[index] ?? 0,
    tokenId: tokenIds[index] ?? null,
  }));
}

export function normalizeMarket(raw: RawGammaMarket): Market {
  return {
    id: String(raw.id),
    conditionId: raw.conditionId,
    slug: raw.slug,
    question: raw.question,
    groupTitle: raw.groupItemTitle?.trim() || null,
    description: raw.description ?? null,
    resolutionSource: raw.resolutionSource?.trim() || null,
    image: raw.image ?? null,
    icon: raw.icon ?? null,
    endDate: raw.endDate ?? null,
    startDate: raw.startDate ?? null,
    closed: Boolean(raw.closed),
    active: Boolean(raw.active),
    acceptingOrders: Boolean(raw.acceptingOrders ?? raw.enableOrderBook),
    negRisk: Boolean(raw.negRisk),
    outcomes: normalizeOutcomes(raw),
    volume: toNumber(raw.volumeNum ?? raw.volume),
    volume24hr: toNumber(raw.volume24hr),
    liquidity: toNumber(raw.liquidityNum ?? raw.liquidity),
    spread: toNumber(raw.spread),
    bestBid: raw.bestBid == null ? null : toNumber(raw.bestBid),
    bestAsk: raw.bestAsk == null ? null : toNumber(raw.bestAsk),
    lastTradePrice: raw.lastTradePrice == null ? null : toNumber(raw.lastTradePrice),
    oneDayPriceChange: toNumber(raw.oneDayPriceChange),
    oneWeekPriceChange: toNumber(raw.oneWeekPriceChange),
    tickSize: toNumber(raw.orderPriceMinTickSize, 0.01) || 0.01,
    minOrderSize: toNumber(raw.orderMinSize, 5),
  };
}

function normalizeTag(raw: RawGammaTag): Tag {
  return { id: String(raw.id), label: raw.label, slug: raw.slug };
}

/** Рынок фактически определился: цена «за» выродилась в 0/1 или торги закрыты. */
function isSettled(market: Market): boolean {
  const price = market.outcomes[0]?.price ?? 0;
  return market.closed || price >= 1 || price <= 0;
}

/** Взаимоисключающие рынки: чем выше вероятность, тем ближе к лидеру гонки. */
function byProbability(a: Market, b: Market): number {
  return (b.outcomes[0]?.price ?? 0) - (a.outcomes[0]?.price ?? 0);
}

/**
 * Независимые ставки: вероятность здесь ничего не ранжирует (сумма цен по
 * событию доходит до 13), поэтому наверх поднимаем самые торгуемые вопросы,
 * а уже определившиеся уводим вниз — иначе список открывают строки на 100%.
 */
function byLiquidity(a: Market, b: Market): number {
  return (
    Number(isSettled(a)) - Number(isSettled(b)) ||
    b.liquidity - a.liquidity ||
    b.volume24hr - a.volume24hr
  );
}

export function normalizeEvent(raw: RawGammaEvent): MarketEvent {
  // negRisk — точный признак взаимоисключительности рынков события.
  const exclusive = Boolean(raw.negRisk ?? raw.enableNegRisk);

  const markets = (raw.markets ?? [])
    .filter((m) => m && !m.archived)
    .map(normalizeMarket)
    .sort(exclusive ? byProbability : byLiquidity);

  // Одно событие с одним рынком на два исхода = бинарная карточка Yes/No.
  // showAllOutcomes здесь не участвует: Gamma ставит его почти всем событиям,
  // и для одиночного рынка он означает лишь «показать и Yes, и No».
  const isBinary = markets.length === 1 && markets[0].outcomes.length === 2;

  return {
    id: String(raw.id),
    slug: raw.slug,
    ticker: raw.ticker ?? null,
    title: raw.title,
    description: raw.description ?? null,
    resolutionSource: raw.resolutionSource?.trim() || null,
    image: raw.image ?? null,
    icon: raw.icon ?? raw.image ?? null,
    startDate: raw.startDate ?? null,
    endDate: raw.endDate ?? null,
    closed: Boolean(raw.closed),
    active: Boolean(raw.active),
    featured: Boolean(raw.featured),
    isNew: Boolean(raw.new),
    live: Boolean(raw.live),
    negRisk: exclusive,
    showAllOutcomes: Boolean(raw.showAllOutcomes),
    volume: toNumber(raw.volume),
    volume24hr: toNumber(raw.volume24hr),
    liquidity: toNumber(raw.liquidity),
    openInterest: toNumber(raw.openInterest),
    commentCount: toNumber(raw.commentCount),
    competitive: toNumber(raw.competitive),
    markets,
    tags: (raw.tags ?? []).map(normalizeTag),
    isBinary,
    exclusive,
  };
}

/* ------------------------------------------------------------------ */
/* События и рынки                                                     */
/* ------------------------------------------------------------------ */

export async function fetchEvents(query: EventQuery = {}): Promise<Paginated<MarketEvent>> {
  const {
    limit = 24,
    offset = 0,
    tagSlug,
    sort = "volume24hr",
    ascending = false,
    closed = false,
    active = true,
  } = query;

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    closed: String(closed),
    order: sort,
    ascending: String(ascending),
  });
  if (active) params.set("active", "true");
  if (tagSlug && tagSlug !== "all") params.set("tag_slug", tagSlug);

  const raw = await request<RawGammaEvent[]>(`${GAMMA}/events?${params}`, {
    revalidate: 20,
  });

  // Событие без рынков нечего показывать в ленте.
  const items = raw.map(normalizeEvent).filter((e) => e.markets.length > 0);

  return { items, hasMore: raw.length === limit, nextOffset: offset + limit };
}

export async function fetchEventBySlug(slug: string): Promise<MarketEvent | null> {
  const raw = await request<RawGammaEvent[]>(
    `${GAMMA}/events?slug=${encodeURIComponent(slug)}`,
    { revalidate: 15 },
  );
  if (!raw.length) return null;
  return normalizeEvent(raw[0]);
}

export async function fetchEventById(id: string): Promise<MarketEvent | null> {
  try {
    const raw = await request<RawGammaEvent>(`${GAMMA}/events/${encodeURIComponent(id)}`, {
      revalidate: 15,
    });
    return normalizeEvent(raw);
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 404) return null;
    throw error;
  }
}

export async function fetchMarketById(id: string): Promise<Market | null> {
  try {
    const raw = await request<RawGammaMarket>(`${GAMMA}/markets/${encodeURIComponent(id)}`, {
      revalidate: 15,
    });
    return normalizeMarket(raw);
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 404) return null;
    throw error;
  }
}

/** Похожие события — по первому «настоящему» тегу текущего события. */
export async function fetchRelatedEvents(
  event: MarketEvent,
  limit = 6,
): Promise<MarketEvent[]> {
  const tag = event.tags.find((t) => t.slug && t.slug !== "all");
  if (!tag) return [];
  const { items } = await fetchEvents({ tagSlug: tag.slug, limit: limit + 1 });
  return items.filter((e) => e.id !== event.id).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Теги и поиск                                                        */
/* ------------------------------------------------------------------ */

export async function fetchTags(): Promise<Tag[]> {
  const raw = await request<RawGammaTag[]>(
    `${GAMMA}/tags?limit=100&is_carousel=true`,
    { revalidate: 600 },
  );
  return raw.filter((t) => !t.forceHide).map(normalizeTag);
}

export interface SearchResult {
  events: MarketEvent[];
  tags: Tag[];
}

export async function search(q: string, limit = 10): Promise<SearchResult> {
  if (!q.trim()) return { events: [], tags: [] };
  const params = new URLSearchParams({
    q: q.trim(),
    limit_per_type: String(limit),
    events_status: "active",
  });
  const raw = await request<{ events?: RawGammaEvent[]; tags?: RawGammaTag[] }>(
    `${GAMMA}/public-search?${params}`,
    { revalidate: 30 },
  );
  return {
    events: (raw.events ?? []).map(normalizeEvent).filter((e) => e.markets.length > 0),
    tags: (raw.tags ?? []).map(normalizeTag),
  };
}

/* ------------------------------------------------------------------ */
/* CLOB: стакан и история цен                                          */
/* ------------------------------------------------------------------ */

interface RawBookLevel {
  price: string;
  size: string;
}
interface RawBook {
  asset_id: string;
  timestamp: string;
  bids?: RawBookLevel[];
  asks?: RawBookLevel[];
}

function normalizeBook(raw: RawBook): OrderBook {
  // CLOB отдаёт bids по возрастанию цены, asks по убыванию — разворачиваем
  // к привычному виду: лучшая цена сверху с каждой стороны.
  const bids = (raw.bids ?? [])
    .map((l) => ({ price: toNumber(l.price), size: toNumber(l.size), total: 0 }))
    .sort((a, b) => b.price - a.price);
  const asks = (raw.asks ?? [])
    .map((l) => ({ price: toNumber(l.price), size: toNumber(l.size), total: 0 }))
    .sort((a, b) => a.price - b.price);

  let runningBid = 0;
  for (const level of bids) {
    runningBid += level.size;
    level.total = runningBid;
  }
  let runningAsk = 0;
  for (const level of asks) {
    runningAsk += level.size;
    level.total = runningAsk;
  }

  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;

  return {
    tokenId: raw.asset_id,
    bids,
    asks,
    spread: bestBid != null && bestAsk != null ? bestAsk - bestBid : null,
    midpoint: bestBid != null && bestAsk != null ? (bestAsk + bestBid) / 2 : null,
    timestamp: toNumber(raw.timestamp),
  };
}

export async function fetchOrderBook(tokenId: string): Promise<OrderBook> {
  const raw = await request<RawBook>(
    `${CLOB}/book?token_id=${encodeURIComponent(tokenId)}`,
    { revalidate: 5 },
  );
  return normalizeBook(raw);
}

/** Пакетный запрос стаканов — один вызов вместо N при нескольких исходах. */
export async function fetchOrderBooks(tokenIds: string[]): Promise<OrderBook[]> {
  if (!tokenIds.length) return [];
  const raw = await request<RawBook[]>(`${CLOB}/books`, {
    method: "POST",
    body: tokenIds.map((token_id) => ({ token_id })),
    revalidate: 5,
  });
  return raw.map(normalizeBook);
}

/**
 * Fidelity — шаг свечей в минутах. Подбираем так, чтобы на любом интервале
 * приходило порядка 100–300 точек: график остаётся плавным, но не тяжёлым.
 */
const FIDELITY: Record<ChartInterval, number> = {
  "1h": 1,
  "6h": 5,
  "1d": 10,
  "1w": 60,
  "1m": 240,
  max: 720,
};

export async function fetchPriceHistory(
  tokenId: string,
  interval: ChartInterval = "1w",
  // Спарклайнам нужна та же история, но с длинным кэшем — отсюда параметр.
  revalidate = 30,
): Promise<PricePoint[]> {
  const params = new URLSearchParams({
    market: tokenId,
    interval,
    fidelity: String(FIDELITY[interval] ?? 60),
  });
  const raw = await request<{ history?: PricePoint[] }>(
    `${CLOB}/prices-history?${params}`,
    { revalidate },
  );
  return (raw.history ?? []).map((p) => ({ t: toNumber(p.t), p: toNumber(p.p) }));
}

/* ------------------------------------------------------------------ */
/* CLOB: пакетные спарклайны                                           */
/* ------------------------------------------------------------------ */

/** Больше одновременных запросов истории CLOB не выдерживает — начинает 429/5xx. */
const SPARKLINE_CONCURRENCY = 8;

/** Недельная история меняется медленно, держим её в кэше пять минут. */
const SPARKLINE_REVALIDATE = 300;

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/**
 * Прореживание по индексу до `count` значений. Первая и последняя точки
 * сохраняются всегда: последняя цена важнее серединных.
 */
function thinSeries(points: PricePoint[], count: number): number[] {
  const values = points.map((p) => p.p).filter((p) => Number.isFinite(p));
  if (values.length <= count) return values.map(round4);

  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(round4(values[Math.round((i * (values.length - 1)) / (count - 1))]));
  }
  return out;
}

/**
 * Короткие ряды цены сразу по списку токенов — для спарклайнов в карточках.
 * Ошибка по отдельному токену не роняет пакет: токен просто отсутствует
 * в ответе, как и ряд короче двух точек (рисовать траекторию нечем).
 */
export async function fetchSparklines(
  tokenIds: string[],
  points = 14,
): Promise<SparklineMap> {
  const queue = [...new Set(tokenIds.filter(Boolean))];
  if (!queue.length) return {};

  const count = Math.max(2, Math.trunc(points));
  const series: SparklineMap = {};
  let cursor = 0;

  // Пул воркеров вместо Promise.all по всему списку: держим окно в N запросов.
  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      const tokenId = queue[cursor++];
      try {
        const history = await fetchPriceHistory(tokenId, "1w", SPARKLINE_REVALIDATE);
        const thinned = thinSeries(history, count);
        if (thinned.length >= 2) series[tokenId] = thinned;
      } catch {
        // Молча пропускаем токен: остальной пакет должен доехать.
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SPARKLINE_CONCURRENCY, queue.length) }, worker),
  );
  return series;
}

/* ------------------------------------------------------------------ */
/* Data API: сделки и холдеры                                          */
/* ------------------------------------------------------------------ */

interface RawTrade extends Omit<Trade, "icon" | "profileImage"> {
  icon?: string;
  profileImage?: string;
}

function normalizeTrade(raw: RawTrade): Trade {
  return {
    proxyWallet: raw.proxyWallet,
    side: raw.side === "SELL" ? "SELL" : "BUY",
    asset: raw.asset,
    conditionId: raw.conditionId,
    size: toNumber(raw.size),
    price: toNumber(raw.price),
    timestamp: toNumber(raw.timestamp),
    title: raw.title ?? "",
    slug: raw.slug ?? "",
    eventSlug: raw.eventSlug || raw.slug || "",
    icon: raw.icon || null,
    outcome: raw.outcome ?? "",
    outcomeIndex: toNumber(raw.outcomeIndex),
    name: raw.name ?? "",
    pseudonym: raw.pseudonym ?? "",
    profileImage: raw.profileImage || null,
    transactionHash: raw.transactionHash ?? "",
  };
}

export interface TradeQuery {
  /** conditionId рынка — лента сделок конкретного рынка. */
  conditionId?: string;
  /** Адрес кошелька — история трейдера. */
  user?: string;
  limit?: number;
  offset?: number;
  /** Порог в долларах: отсечь мелочь в глобальной ленте. */
  filterAmount?: number;
}

export async function fetchTrades(query: TradeQuery = {}): Promise<Trade[]> {
  const { conditionId, user, limit = 30, offset = 0, filterAmount } = query;
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    takerOnly: "true",
  });
  if (conditionId) params.set("market", conditionId);
  if (user) params.set("user", user);
  if (filterAmount) {
    params.set("filterType", "CASH");
    params.set("filterAmount", String(filterAmount));
  }

  const raw = await request<RawTrade[]>(`${DATA}/trades?${params}`, { revalidate: 10 });
  return Array.isArray(raw) ? raw.map(normalizeTrade) : [];
}

interface RawHolderGroup {
  token: string;
  holders?: Array<Omit<Holder, "profileImage"> & { profileImage?: string }>;
}

/**
 * Топ держателей по каждому исходу рынка. Data API отдаёт группы по token id,
 * читаемые названия исходов подставляем из рынка.
 */
export async function fetchHolders(
  conditionId: string,
  market?: Market,
  limit = 10,
): Promise<HolderGroup[]> {
  const params = new URLSearchParams({ market: conditionId, limit: String(limit) });
  const raw = await request<RawHolderGroup[]>(`${DATA}/holders?${params}`, {
    revalidate: 60,
  });
  if (!Array.isArray(raw)) return [];

  return raw.map((group) => {
    const outcome = market?.outcomes.find((o) => o.tokenId === group.token);
    return {
      tokenId: group.token,
      outcomeLabel: outcome?.label ?? "—",
      holders: (group.holders ?? []).map((h) => ({
        proxyWallet: h.proxyWallet,
        name: h.name ?? "",
        pseudonym: h.pseudonym ?? "",
        profileImage: h.profileImage || null,
        amount: toNumber(h.amount),
        outcomeIndex: toNumber(h.outcomeIndex),
        asset: h.asset,
      })),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Лидерборд                                                           */
/* ------------------------------------------------------------------ */

interface RawLeaderboardEntry {
  proxyWallet: string;
  name?: string;
  pseudonym?: string;
  profileImage?: string;
  amount: number;
}

export async function fetchLeaderboard(
  type: LeaderboardType = "volume",
  window: LeaderboardWindow = "1d",
  limit = 20,
): Promise<LeaderboardEntry[]> {
  const path = type === "profit" ? "profit" : "volume";
  const rankType = type === "profit" ? "pnl" : "vol";
  const params = new URLSearchParams({
    window,
    limit: String(limit),
    rankType,
  });
  const raw = await request<RawLeaderboardEntry[]>(`${LEADERBOARD}/${path}?${params}`, {
    revalidate: 120,
  });
  if (!Array.isArray(raw)) return [];

  return raw.map((entry, i) => ({
    rank: i + 1,
    proxyWallet: entry.proxyWallet,
    name: entry.name ?? "",
    pseudonym: entry.pseudonym ?? "",
    profileImage: entry.profileImage || null,
    amount: toNumber(entry.amount),
  }));
}
