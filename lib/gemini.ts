import type { DayContext, ScoredSuggestion } from "./types";
import { getGeminiModel } from "./gemini-client";
import { getCached, stableCacheKey } from "./ttl-cache";

export async function summarizePlan(context: DayContext, suggestions: ScoredSuggestion[]) {
  return getCached("plan-summary", summaryCacheKey(context, suggestions), 60 * 60 * 1000, () =>
    summarizePlanUncached(context, suggestions)
  );
}

async function summarizePlanUncached(context: DayContext, suggestions: ScoredSuggestion[]) {
  const model = getGeminiModel();
  if (!model) {
    return `A good ${context.city || "local"} day starts with ${suggestions[0]?.title.toLowerCase() ?? "a flexible plan"}.`;
  }

  const top = suggestions.slice(0, 3).map((item) => `${item.title}: ${item.description}`).join("\n");
  const result = await model.generateContent(
    `Write one concise, practical sentence for a day plan in ${context.city}. Weather: ${context.weather}. Options:\n${top}`
  );

  return result.response.text().trim();
}

function summaryCacheKey(context: DayContext, suggestions: ScoredSuggestion[]) {
  return stableCacheKey({
    city: context.city.trim().toLowerCase(),
    weather: context.weather,
    timeOfDay: context.timeOfDay,
    suggestionIds: suggestions.slice(0, 3).map((suggestion) => suggestion.id)
  });
}
