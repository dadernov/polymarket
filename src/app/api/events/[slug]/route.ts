import type { NextRequest } from "next/server";

import { CACHE, badRequest, handleError, json, notFound } from "@/lib/http";
import { fetchEventBySlug } from "@/lib/polymarket";

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/events/[slug]">,
) {
  try {
    const { slug } = await ctx.params;
    const clean = slug.trim();
    if (!clean) return badRequest("Event slug is required");

    const event = await fetchEventBySlug(clean);
    if (!event) return notFound(`Event "${clean}" not found`);

    return json(event, CACHE.event);
  } catch (error) {
    return handleError(error);
  }
}
