import type { NextRequest } from "next/server";

import { CACHE, enumParam, handleError, intParam, json } from "@/lib/http";
import { fetchLeaderboard } from "@/lib/polymarket";
import type { LeaderboardType, LeaderboardWindow } from "@/lib/types";

const TYPES = ["volume", "profit"] as const satisfies readonly LeaderboardType[];
const WINDOWS = [
  "1d",
  "7d",
  "30d",
  "all",
] as const satisfies readonly LeaderboardWindow[];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const type = enumParam(params, "type", TYPES, "volume");
    const timeWindow = enumParam(params, "window", WINDOWS, "1d");
    const limit = intParam(params, "limit", 20, 1, 100);

    return json(
      await fetchLeaderboard(type, timeWindow, limit),
      CACHE.leaderboard,
    );
  } catch (error) {
    return handleError(error);
  }
}
