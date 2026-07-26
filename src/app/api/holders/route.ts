import type { NextRequest } from "next/server";

import {
  CACHE,
  handleError,
  intParam,
  json,
  optionalParam,
  requireParam,
} from "@/lib/http";
import { fetchHolders, fetchMarketById } from "@/lib/polymarket";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const conditionId = requireParam(params, "conditionId");
    const marketId = optionalParam(params, "marketId");
    const limit = intParam(params, "limit", 10, 1, 50);

    // Рынок нужен только ради читаемых названий исходов: если он не
    // подгрузился, отдаём холдеров с прочерком вместо метки.
    const market = marketId
      ? await fetchMarketById(marketId).catch(() => null)
      : null;

    return json(
      await fetchHolders(conditionId, market ?? undefined, limit),
      CACHE.holders,
    );
  } catch (error) {
    return handleError(error);
  }
}
