/** Форматирование чисел, денег, процентов и дат для UI. */

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** `$1.2m`, `$845k`, `$312` — как в шапке карточки рынка. */
export function formatVolume(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "$0";
  if (value < 1000) return `$${Math.round(value)}`;
  return `$${compact.format(value).toLowerCase()}`;
}

/** `1.2m`, `845k` — без знака доллара (объёмы в акциях). */
export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "0";
  if (Math.abs(value) < 1000) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return compact.format(value).toLowerCase();
}

/** Денежная сумма с двумя знаками: `$1,234.50`. */
export function formatMoney(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "$0.00";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Со знаком: `+$12.40` / `-$3.10`. Для P&L. */
export function formatSignedMoney(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "$0.00";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatMoney(Math.abs(value), digits)}`;
}

/**
 * Цена 0..1 → целые проценты: `62%`. Основная подача вероятности.
 *
 * Границы 100% и 0% оставлены только точным 1 и 0 — это действительно
 * решённый рынок. Живой рынок на 99.6¢ округлялся бы до «100%» и выглядел
 * бы решённым, хотя на нём остаётся доходность, поэтому такие цены
 * показываем как `>99%` / `<1%`.
 */
export function formatProbability(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return "—";
  const p = clamp01(price);
  const pct = Math.round(p * 100);
  if (pct === 100 && p < 1) return ">99%";
  if (pct === 0 && p > 0) return "<1%";
  return `${pct}%`;
}

/** Цена 0..1 → центы: `62.4¢`. Используется в стакане и панели сделки. */
export function formatCents(price: number | null | undefined, digits = 1): string {
  if (price == null || !Number.isFinite(price)) return "—";
  const p = clamp01(price);
  // Округлённая до целых цена — витринная (кнопки карточек), и к ней
  // применимо то же правило границ, что и к formatProbability.
  if (digits === 0) {
    const cents = Math.round(p * 100);
    if (cents === 100 && p < 1) return ">99¢";
    if (cents === 0 && p > 0) return "<1¢";
    return `${cents}¢`;
  }
  return `${(p * 100).toFixed(digits)}¢`;
}

/** Изменение в процентных пунктах: `+4.2` / `-1.0`. */
export function formatPointChange(delta: number | null | undefined): string {
  if (delta == null || !Number.isFinite(delta) || delta === 0) return "0.0";
  const pts = delta * 100;
  return `${pts > 0 ? "+" : ""}${pts.toFixed(1)}`;
}

/** Относительное изменение: `+12.5%`. */
export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null || !Number.isFinite(ratio)) return "0.0%";
  return `${ratio > 0 ? "+" : ""}${(ratio * 100).toFixed(digits)}%`;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** `Jul 26, 2026` — дата окончания рынка. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** `Jul 26, 7:40 AM` — метка на графике и в ленте сделок. */
export function formatDateTime(input: string | number | Date): string {
  const d = toDate(input);
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** `2h ago`, `3d ago` — для ленты активности. */
export function formatRelativeTime(input: string | number | Date): string {
  const d = toDate(input);
  if (!d) return "—";
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** `3d left`, `5h left`, `Closed` — счётчик до закрытия рынка. */
export function formatTimeLeft(iso: string | null | undefined): string {
  if (!iso) return "—";
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return "—";
  const diff = end - Date.now();
  if (diff <= 0) return "Closed";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d left`;
  const months = Math.floor(days / 30);
  return `${months}mo left`;
}

/** `0x1234…ab90` — сокращение адреса кошелька. */
export function shortenAddress(address: string | null | undefined): string {
  if (!address) return "—";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Отображаемое имя трейдера: имя → псевдоним → адрес. */
export function traderName(user: {
  name?: string | null;
  pseudonym?: string | null;
  proxyWallet?: string | null;
}): string {
  const label = user.name?.trim() || user.pseudonym?.trim();
  // У части профилей вместо имени лежит сам адрес — его нельзя показывать целиком,
  // иначе строка ленты расползается.
  if (label) return isAddress(label) ? shortenAddress(label) : label;
  return shortenAddress(user.proxyWallet);
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function toDate(input: string | number | Date): Date | null {
  let d: Date;
  if (input instanceof Date) d = input;
  // Data API отдаёт unix-секунды, Date ждёт миллисекунды.
  else if (typeof input === "number") d = new Date(input < 1e12 ? input * 1000 : input);
  else d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}
