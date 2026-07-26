import type { NextRequest } from "next/server";

import {
  CACHE,
  boolParam,
  enumParam,
  handleError,
  intParam,
  json,
  optionalParam,
} from "@/lib/http";
import { fetchEvents, search } from "@/lib/polymarket";
import type { EventSort, MarketEvent, Paginated } from "@/lib/types";

const SORTS = [
  "volume24hr",
  "volume",
  "liquidity",
  "competitive",
  "endDate",
  "startDate",
] as const satisfies readonly EventSort[];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const limit = intParam(params, "limit", 24, 1, 100);
    const offset = intParam(params, "offset", 0, 0, 10_000);
    const sort = enumParam(params, "sort", SORTS, "volume24hr");
    const closed = boolParam(params, "closed");
    const ascending = boolParam(params, "ascending");
    const tag = optionalParam(params, "tag");
    const q = optionalParam(params, "q");

    // Поиск живёт в отдельном апстриме и не пагинируется — заворачиваем
    // результат в ту же оболочку, чтобы клиенту не различать два формата.
    if (q) {
      const { events } = await search(q, limit);
      const page: Paginated<MarketEvent> = {
        items: events,
        hasMore: false,
        nextOffset: offset + events.length,
      };
      return json(page, CACHE.search);
    }

    const page = await fetchEvents({
      limit,
      offset,
      sort,
      closed,
      tagSlug: tag,
      ascending,
      // Закрытые события уже неактивны — иначе фильтр отдаёт пустоту.
      active: !closed,
    });

    return json(page, CACHE.events);
  } catch (error) {
    return handleError(error);
  }
}
