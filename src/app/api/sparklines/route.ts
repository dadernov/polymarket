import type { NextRequest } from "next/server";

import { badRequest, handleError, json, optionalParam } from "@/lib/http";
import { fetchSparklines } from "@/lib/polymarket";
import type { SparklineMap } from "@/lib/types";

/** Недельная история почти не двигается — на краю можно держать 5 минут. */
const CACHE_SPARKLINES = "public, s-maxage=300, stale-while-revalidate=1800";

/** Больше — уже не «видимый экран», а выкачивание истории пачкой. */
const MAX_TOKENS = 40;

/** CLOB-токен — большое десятичное число; всё прочее считаем мусором. */
const TOKEN_ID = /^\d+$/;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const raw = optionalParam(params, "tokenIds") ?? "";
    const tokenIds = [
      ...new Set(
        raw
          .split(",")
          .map((id) => id.trim())
          .filter((id) => TOKEN_ID.test(id)),
      ),
    ];

    if (tokenIds.length > MAX_TOKENS) {
      return badRequest(
        `Query parameter "tokenIds" accepts at most ${MAX_TOKENS} token ids per request`,
      );
    }
    if (!tokenIds.length) return json<SparklineMap>({}, CACHE_SPARKLINES);

    return json(await fetchSparklines(tokenIds), CACHE_SPARKLINES);
  } catch (error) {
    return handleError(error);
  }
}
