import type { NextRequest } from "next/server";

import { CACHE, handleError, json, requireParam } from "@/lib/http";
import { fetchOrderBook } from "@/lib/polymarket";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const tokenId = requireParam(params, "tokenId");
    return json(await fetchOrderBook(tokenId), CACHE.live);
  } catch (error) {
    return handleError(error);
  }
}
