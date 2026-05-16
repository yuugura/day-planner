import { NextResponse } from "next/server";
import { readFeedback } from "@/lib/db";
import { summarizePlan } from "@/lib/gemini";
import { fetchPlaceSuggestionsSafe } from "@/lib/places";
import { rankSuggestions } from "@/lib/recommender";
import { readSuggestions } from "@/lib/suggestions";
import type { DayContext, PlaceLookup } from "@/lib/types";

const defaultContext: DayContext = {
  city: "Toronto",
  weather: "cloudy",
  temperatureF: 55,
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
  const userId = body.userId?.trim() || "anonymous-user";
  const placeLookup = normalizePlaceLookup(body.place, context.city);
  const [feedback, availableSuggestions, placeSuggestions] = await Promise.all([
    readFeedback(userId),
    readSuggestions(userId),
    fetchPlaceSuggestionsSafe(placeLookup)
  ]);
  const suggestions = rankSuggestions([...placeSuggestions, ...availableSuggestions], context, feedback);
  const summary = await summarizePlan(context, suggestions).catch(() => "");

  return NextResponse.json({
    context,
    summary,
    suggestions,
    trainingExamples: feedback.length,
    livePlaceCount: placeSuggestions.length
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
