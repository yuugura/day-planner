import { NextResponse } from "next/server";
import { resolvePersonalizationUserId } from "@/lib/auth";
import { readFeedback } from "@/lib/db";
import { fetchEventSuggestionsSafe } from "@/lib/events";
import { summarizePlan } from "@/lib/gemini";
import { fetchPlaceSuggestionsSafe } from "@/lib/places";
import { rankSuggestions } from "@/lib/recommender";
import { readSuggestions } from "@/lib/suggestions";
import type { DayContext, PlaceLookup } from "@/lib/types";

const defaultContext: DayContext = {
  city: "Toronto",
  weather: "cloudy",
  temperatureF: 55,
  localHour: 12,
  timeOfDay: "midday",
  timeZone: "America/Toronto",
  availableHours: 3,
  budget: "low",
  energy: "medium",
  social: "flexible",
  preferenceTags: ["fresh-air", "food", "low-planning"]
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<DayContext> & {
    userId?: string;
    place?: PlaceLookup;
  };
  const context: DayContext = {
    ...defaultContext,
    ...body,
    city: body.city?.trim() || defaultContext.city,
    preferenceTags: Array.isArray(body.preferenceTags) ? body.preferenceTags : defaultContext.preferenceTags
  };
  const userId = await resolvePersonalizationUserId(request, body.userId);
  const placeLookup = normalizePlaceLookup(body.place, context.city);
  const [feedback, availableSuggestions, placeSuggestions, eventSuggestions] = await Promise.all([
    readFeedback(userId),
    readSuggestions(userId),
    fetchPlaceSuggestionsSafe(placeLookup),
    fetchEventSuggestionsSafe(placeLookup)
  ]);
  const suggestions = rankSuggestions(availableSuggestions, context, feedback);
  const summary = await summarizePlan(context, suggestions).catch(() => "");

  return NextResponse.json({
    context,
    summary,
    suggestions,
    livePlaces: placeSuggestions,
    liveEvents: eventSuggestions,
    trainingExamples: feedback.length,
    livePlaceCount: placeSuggestions.length,
    liveEventCount: eventSuggestions.length
  });
}

function normalizePlaceLookup(place: PlaceLookup | undefined, city: string): PlaceLookup | null {
  if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return null;

  return {
    city: place.city?.trim() || city,
    latitude: place.latitude,
    longitude: place.longitude
  };
}
