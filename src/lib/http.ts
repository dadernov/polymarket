/**
 * Общие помощники route handlers: единый JSON-ответ с кэш-заголовком,
 * защитный разбор query-параметров и безопасное превращение ошибок в ответ.
 *
 * Наружу из этого модуля никогда не уходят URL апстрима и стектрейсы —
 * только короткое `{ error }`.
 */

import { NextResponse } from "next/server";
import { UpstreamError } from "./polymarket";

export interface ErrorBody {
  error: string;
}

/** Негодный query-параметр. Ловится в handleError и превращается в 400. */
export class BadParam extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadParam";
  }
}

/** Cache-Control под разную «живость» данных. */
export const CACHE = {
  /** Стакан и лента сделок — меняются каждую секунду. */
  live: "public, s-maxage=5, stale-while-revalidate=30",
  events: "public, s-maxage=20, stale-while-revalidate=120",
  event: "public, s-maxage=15, stale-while-revalidate=90",
  search: "public, s-maxage=30, stale-while-revalidate=120",
  prices: "public, s-maxage=30, stale-while-revalidate=180",
  holders: "public, s-maxage=60, stale-while-revalidate=300",
  leaderboard: "public, s-maxage=120, stale-while-revalidate=600",
  /** Теги живут долго. */
  tags: "public, s-maxage=600, stale-while-revalidate=3600",
} as const;

/* ------------------------------------------------------------------ */
/* Ответы                                                              */
/* ------------------------------------------------------------------ */

export function json<T>(data: T, cache?: string): NextResponse<T> {
  return NextResponse.json(data, {
    headers: cache ? { "Cache-Control": cache } : undefined,
  });
}

function fail(message: string, status: number): NextResponse<ErrorBody> {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function badRequest(message: string): NextResponse<ErrorBody> {
  return fail(message, 400);
}

export function notFound(message = "Not found"): NextResponse<ErrorBody> {
  return fail(message, 404);
}

/**
 * Ошибка -> ответ. Плохой параметр даёт 400, ошибка апстрима — его статус,
 * всё остальное — 502. Подробности пишем только в серверный лог.
 */
export function handleError(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof BadParam) return badRequest(error.message);

  if (error instanceof UpstreamError) {
    console.error(`[api] upstream ${error.status}: ${error.url}`);
    const status = error.status >= 400 && error.status <= 599 ? error.status : 502;
    return fail(
      status === 404 ? "Not found" : `Upstream request failed (${status})`,
      status,
    );
  }

  console.error("[api] handler failed:", error);
  return fail("Upstream request failed", 502);
}

/* ------------------------------------------------------------------ */
/* Разбор query-параметров                                             */
/* ------------------------------------------------------------------ */

/** Обязательная непустая строка. */
export function requireParam(params: URLSearchParams, name: string): string {
  const value = params.get(name)?.trim();
  if (!value) throw new BadParam(`Query parameter "${name}" is required`);
  return value;
}

/** Необязательная строка: пустое значение считаем отсутствующим. */
export function optionalParam(params: URLSearchParams, name: string): string | undefined {
  return params.get(name)?.trim() || undefined;
}

function parseNumber(params: URLSearchParams, name: string): number | undefined {
  const raw = params.get(name)?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new BadParam(`Query parameter "${name}" must be a number`);
  }
  return n;
}

/** Целое число, зажатое в диапазон. Нечисловое значение — 400. */
export function intParam(
  params: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = parseNumber(params, name);
  if (n === undefined) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Дробное число, зажатое в диапазон. */
export function floatParam(
  params: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = parseNumber(params, name);
  if (n === undefined) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Значение из фиксированного набора; чужое — 400 со списком допустимых. */
export function enumParam<T extends string>(
  params: URLSearchParams,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = params.get(name)?.trim();
  if (!raw) return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new BadParam(
      `Query parameter "${name}" must be one of: ${allowed.join(", ")}`,
    );
  }
  return raw as T;
}

/** Флаг: true/1/yes и false/0/no, всё прочее — 400. */
export function boolParam(
  params: URLSearchParams,
  name: string,
  fallback = false,
): boolean {
  const raw = params.get(name)?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  throw new BadParam(`Query parameter "${name}" must be true or false`);
}
