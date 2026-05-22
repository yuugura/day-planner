import { NextResponse } from "next/server";
import { fetchPlaceSuggestionsSafe } from "@/lib/places";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import type { PlaceLookup } from "@/lib/types";

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, {
    namespace: "places",
    limit: 10,
    windowMs: 60 * 1000
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many nearby option refreshes. Please wait a moment and try again." },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Partial<PlaceLookup> & {
    refresh?: boolean;
  };
  const place = normalizePlaceLookup(body);

  if (!place) {
    return NextResponse.json({ error: "A city, latitude, and longitude are required." }, { status: 400 });
  }

  const places = await fetchPlaceSuggestionsSafe(place, undefined, { refresh: body.refresh === true });

  return NextResponse.json({
    livePlaces: places,
    livePlaceCount: places.length
  });
}

function normalizePlaceLookup(place: Partial<PlaceLookup>): PlaceLookup | null {
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return null;

  return {
    city: place.city?.trim() || "Selected city",
    latitude: Number(place.latitude),
    longitude: Number(place.longitude)
  };
}
