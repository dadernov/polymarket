import type { NextRequest } from "next/server";

import { CACHE, enumParam, handleError, json, requireParam } from "@/lib/http";
import { fetchPriceHistory } from "@/lib/polymarket";
import type { ChartInterval } from "@/lib/types";

const INTERVALS = [
  "1h",
  "6h",
  "1d",
  "1w",
  "1m",
  "max",
] as const satisfies readonly ChartInterval[];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const tokenId = requireParam(params, "tokenId");
    const interval = enumParam(params, "interval", INTERVALS, "1w");

    return json(await fetchPriceHistory(tokenId, interval), CACHE.prices);
  } catch (error) {
    return handleError(error);
  }
}
