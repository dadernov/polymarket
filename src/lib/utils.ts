import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Склейка классов Tailwind с разрешением конфликтов. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Палитра для серий на графике мультирынка. Первые два цвета совпадают с
 * Yes/No, дальше — различимые оттенки для списков исходов.
 */
export const SERIES_COLORS = [
  "#23c37e",
  "#f2596e",
  "#3aa9e6",
  "#b07cf0",
  "#efb757",
  "#4dd6c1",
  "#f08a4b",
  "#7a8cf5",
] as const;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

/**
 * Цвет исхода: Yes/No красим семантически, остальные — по индексу.
 * Держим в одном месте, чтобы карточки, график и стакан не разъезжались.
 */
export function outcomeColor(label: string, index: number): string {
  const normalized = label.trim().toLowerCase();
  if (normalized === "yes" || normalized === "up" || normalized === "over") return "#23c37e";
  if (normalized === "no" || normalized === "down" || normalized === "under") return "#f2596e";
  return seriesColor(index);
}

/** Ссылка на страницу события. */
export function eventHref(slug: string): string {
  return `/event/${slug}`;
}

/** Заглушка на случай битой или отсутствующей картинки рынка. */
export const FALLBACK_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#222a38"/><path d="M24 48l12-14 10 11 10-13" stroke="#8a94a6" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  );

/** Безопасный источник картинки: пустые строки и не-http отсекаем. */
export function imageSrc(src: string | null | undefined): string {
  if (!src || !/^https?:\/\//.test(src)) return FALLBACK_IMAGE;
  return src;
}
