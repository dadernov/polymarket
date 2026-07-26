import type { NextRequest } from "next/server";

import {
  CACHE,
  floatParam,
  handleError,
  intParam,
  json,
  optionalParam,
} from "@/lib/http";
import { fetchTrades } from "@/lib/polymarket";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const conditionId = optionalParam(params, "conditionId");
    const user = optionalParam(params, "user");
    const limit = intParam(params, "limit", 30, 1, 100);
    const offset = intParam(params, "offset", 0, 0, 10_000);
    const minAmount = floatParam(params, "minAmount", 0, 0, 1_000_000);

    const trades = await fetchTrades({
      conditionId,
      user,
      limit,
      offset,
      // Ноль означает «без порога» — иначе апстрим включит фильтр вхолостую.
      filterAmount: minAmount > 0 ? minAmount : undefined,
    });

    return json(trades, CACHE.live);
  } catch (error) {
    return handleError(error);
  }
}
