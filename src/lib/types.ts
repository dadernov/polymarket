/**
 * Типы данных Polymarket.
 *
 * Источники (все публичные, без авторизации):
 *  - Gamma API      https://gamma-api.polymarket.com  — события, рынки, теги, поиск
 *  - CLOB API       https://clob.polymarket.com       — стакан, история цен
 *  - Data API       https://data-api.polymarket.com   — сделки, холдеры, позиции
 *  - Leaderboard    https://lb-api.polymarket.com     — рейтинги по объёму и прибыли
 *
 * Gamma отдаёт часть полей строками с JSON внутри (`outcomes`, `outcomePrices`,
 * `clobTokenIds`). Сырые формы описаны в `Raw*`, нормализованные — ниже.
 */

/* ------------------------------------------------------------------ */
/* Сырые ответы Gamma                                                  */
/* ------------------------------------------------------------------ */

export interface RawGammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  resolutionSource?: string;
  endDate?: string;
  startDate?: string;
  image?: string;
  icon?: string;
  description?: string;
  /** JSON-строка: `["Yes","No"]` */
  outcomes?: string;
  /** JSON-строка: `["0.62","0.38"]` */
  outcomePrices?: string;
  /** JSON-строка с id токенов ERC-1155 для CLOB */
  clobTokenIds?: string;
  groupItemTitle?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  restricted?: boolean;
  enableOrderBook?: boolean;
  acceptingOrders?: boolean;
  orderPriceMinTickSize?: number;
  orderMinSize?: number;
  volumeNum?: number;
  liquidityNum?: number;
  volume?: string | number;
  liquidity?: string | number;
  volume24hr?: number;
  volume1wk?: number;
  volume1mo?: number;
  volume1yr?: number;
  spread?: number;
  bestBid?: number;
  bestAsk?: number;
  lastTradePrice?: number;
  oneDayPriceChange?: number;
  oneWeekPriceChange?: number;
  oneMonthPriceChange?: number;
  negRisk?: boolean;
  umaResolutionStatuses?: string;
  competitive?: number;
}

export interface RawGammaTag {
  id: string;
  label: string;
  slug: string;
  forceShow?: boolean;
  forceHide?: boolean;
  isCarousel?: boolean;
}

export interface RawGammaEvent {
  id: string;
  ticker?: string;
  slug: string;
  title: string;
  description?: string;
  resolutionSource?: string;
  startDate?: string;
  endDate?: string;
  creationDate?: string;
  image?: string;
  icon?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  new?: boolean;
  featured?: boolean;
  restricted?: boolean;
  liquidity?: number;
  volume?: number;
  openInterest?: number;
  volume24hr?: number;
  volume1wk?: number;
  volume1mo?: number;
  volume1yr?: number;
  competitive?: number;
  commentCount?: number;
  enableOrderBook?: boolean;
  enableNegRisk?: boolean;
  negRisk?: boolean;
  showAllOutcomes?: boolean;
  showMarketImages?: boolean;
  live?: boolean;
  ended?: boolean;
  markets?: RawGammaMarket[];
  tags?: RawGammaTag[];
  series?: unknown[];
}

/* ------------------------------------------------------------------ */
/* Нормализованные модели, с которыми работает UI                      */
/* ------------------------------------------------------------------ */

/** Один исход рынка: название, цена (0..1) и id токена в CLOB. */
export interface Outcome {
  /** Индекс исхода внутри рынка (0 = обычно Yes). */
  index: number;
  label: string;
  /** Вероятность/цена в долларах за акцию, 0..1. */
  price: number;
  /** ERC-1155 token id для запросов в CLOB (стакан, история). */
  tokenId: string | null;
}

export interface Market {
  id: string;
  conditionId: string;
  slug: string;
  question: string;
  /** Короткий заголовок внутри группы (напр. «Above $120k»). */
  groupTitle: string | null;
  description: string | null;
  resolutionSource: string | null;
  image: string | null;
  icon: string | null;
  endDate: string | null;
  startDate: string | null;
  closed: boolean;
  active: boolean;
  acceptingOrders: boolean;
  negRisk: boolean;
  outcomes: Outcome[];
  volume: number;
  volume24hr: number;
  liquidity: number;
  spread: number;
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  /** Изменение цены первого исхода за 24 часа, в долях (0.05 = +5 п.п.). */
  oneDayPriceChange: number;
  oneWeekPriceChange: number;
  /** Минимальный шаг цены, обычно 0.01 или 0.001. */
  tickSize: number;
  minOrderSize: number;
}

export interface Tag {
  id: string;
  label: string;
  slug: string;
}

export interface MarketEvent {
  id: string;
  slug: string;
  ticker: string | null;
  title: string;
  description: string | null;
  resolutionSource: string | null;
  image: string | null;
  icon: string | null;
  startDate: string | null;
  endDate: string | null;
  closed: boolean;
  active: boolean;
  featured: boolean;
  isNew: boolean;
  live: boolean;
  negRisk: boolean;
  /** Показывать все исходы списком, даже если рынок бинарный. */
  showAllOutcomes: boolean;
  volume: number;
  volume24hr: number;
  liquidity: number;
  openInterest: number;
  commentCount: number;
  /** Индекс «конкурентности» рынка от Gamma, 0..1. */
  competitive: number;
  markets: Market[];
  tags: Tag[];
  /**
   * true — событие представляет собой один бинарный рынок Yes/No
   * (карточка рисует круговой индикатор и две кнопки).
   * false — набор взаимоисключающих исходов (список строк).
   */
  isBinary: boolean;
}

/* ------------------------------------------------------------------ */
/* CLOB                                                                */
/* ------------------------------------------------------------------ */

export interface BookLevel {
  price: number;
  size: number;
  /** Накопленный размер от лучшей цены, заполняется на клиенте. */
  total: number;
}

export interface OrderBook {
  tokenId: string;
  /** Заявки на покупку, отсортированы по убыванию цены. */
  bids: BookLevel[];
  /** Заявки на продажу, отсортированы по возрастанию цены. */
  asks: BookLevel[];
  spread: number | null;
  midpoint: number | null;
  timestamp: number;
}

export interface PricePoint {
  /** Unix-время в секундах. */
  t: number;
  /** Цена 0..1. */
  p: number;
}

export type ChartInterval = "1h" | "6h" | "1d" | "1w" | "1m" | "max";

export interface PriceSeries {
  tokenId: string;
  label: string;
  color: string;
  points: PricePoint[];
}

/* ------------------------------------------------------------------ */
/* Data API                                                            */
/* ------------------------------------------------------------------ */

export interface Trade {
  proxyWallet: string;
  side: "BUY" | "SELL";
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  /** Unix-время в секундах. */
  timestamp: number;
  title: string;
  slug: string;
  eventSlug: string;
  icon: string | null;
  outcome: string;
  outcomeIndex: number;
  name: string;
  pseudonym: string;
  profileImage: string | null;
  transactionHash: string;
}

export interface Holder {
  proxyWallet: string;
  name: string;
  pseudonym: string;
  profileImage: string | null;
  amount: number;
  outcomeIndex: number;
  asset: string;
}

export interface HolderGroup {
  tokenId: string;
  outcomeLabel: string;
  holders: Holder[];
}

export interface LeaderboardEntry {
  rank: number;
  proxyWallet: string;
  name: string;
  pseudonym: string;
  profileImage: string | null;
  amount: number;
}

export type LeaderboardWindow = "1d" | "7d" | "30d" | "all";
export type LeaderboardType = "volume" | "profit";

/* ------------------------------------------------------------------ */
/* Параметры выборки событий                                           */
/* ------------------------------------------------------------------ */

export type EventSort =
  | "volume24hr"
  | "volume"
  | "liquidity"
  | "competitive"
  | "endDate"
  | "startDate";

export interface EventQuery {
  limit?: number;
  offset?: number;
  tagSlug?: string;
  /** Поисковая строка (уходит в public-search). */
  q?: string;
  sort?: EventSort;
  ascending?: boolean;
  closed?: boolean;
  /** Только события с уже открытой торговлей. */
  active?: boolean;
}

export interface Paginated<T> {
  items: T[];
  /** Есть ли следующая страница (эвристика: пришло ровно `limit`). */
  hasMore: boolean;
  nextOffset: number;
}
