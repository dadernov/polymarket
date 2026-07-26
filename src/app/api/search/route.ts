import type { NextRequest } from "next/server";

import { CACHE, handleError, intParam, json, optionalParam } from "@/lib/http";
import { search, type SearchResult } from "@/lib/polymarket";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const q = optionalParam(params, "q");
    const limit = intParam(params, "limit", 10, 1, 50);

    // Пустой запрос — не ошибка: строка очищается на каждом backspace.
    if (!q) {
      const empty: SearchResult = { events: [], tags: [] };
      return json(empty, CACHE.search);
    }

    return json(await search(q, limit), CACHE.search);
  } catch (error) {
    return handleError(error);
  }
}
