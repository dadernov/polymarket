import { CACHE, handleError, json } from "@/lib/http";
import { fetchTags } from "@/lib/polymarket";

export async function GET() {
  try {
    return json(await fetchTags(), CACHE.tags);
  } catch (error) {
    return handleError(error);
  }
}
