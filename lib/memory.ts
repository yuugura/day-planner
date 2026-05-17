import type { FeedbackRecord, Suggestion, SuggestionCategory } from "./types";

export type FeedbackMemoryItem = {
  id: string;
  suggestionId: string;
  title: string;
  liked: boolean;
  category?: SuggestionCategory;
  source?: Suggestion["source"];
  createdAt?: string;
};

export type FeedbackMemory = {
  feedbackCount: number;
  likesCount: number;
  dislikesCount: number;
  modelReady: boolean;
  insights: string[];
  recent: FeedbackMemoryItem[];
};

const categoryLabels: Record<SuggestionCategory, string> = {
  outdoors: "outdoor",
  culture: "culture",
  food: "food",
  fitness: "fitness",
  social: "social",
  productive: "productive",
  creative: "creative",
  rest: "restful"
};

export function buildFeedbackMemory(records: FeedbackRecord[], suggestions: Suggestion[] = []): FeedbackMemory {
  const suggestionMap = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]));
  const hydratedRecords = records.map((record) => ({
    ...record,
    suggestion: record.suggestion ?? suggestionMap.get(record.suggestionId) ?? null
  }));
  const likes = hydratedRecords.filter((record) => record.liked);
  const dislikes = hydratedRecords.filter((record) => !record.liked);
  const insights = buildInsights(likes, dislikes);

  return {
    feedbackCount: records.length,
    likesCount: likes.length,
    dislikesCount: dislikes.length,
    modelReady: records.length >= 4,
    insights,
    recent: hydratedRecords.slice(0, 8).map((record, index) => ({
      id: `${record.suggestionId}-${record.createdAt ?? index}`,
      suggestionId: record.suggestionId,
      title: record.suggestion?.title ?? readableSuggestionId(record.suggestionId),
      liked: record.liked,
      category: record.suggestion?.category,
      source: record.suggestion?.source,
      createdAt: record.createdAt
    }))
  };
}

function buildInsights(likes: Array<FeedbackRecord & { suggestion: Suggestion | null }>, dislikes: Array<FeedbackRecord & { suggestion: Suggestion | null }>) {
  const insights: string[] = [];

  if (likes.length + dislikes.length === 0) {
    return ["Like or dislike a few picks and this will start describing your preferences."];
  }

  const likedCategory = topDelta(likes, dislikes, (suggestion) => suggestion.category);
  if (likedCategory && isSuggestionCategory(likedCategory)) {
    insights.push(`So far, you seem to like ${categoryLabels[likedCategory]} ideas.`);
  }

  const dislikedCategory = topDelta(dislikes, likes, (suggestion) => suggestion.category);
  if (dislikedCategory && isSuggestionCategory(dislikedCategory)) {
    insights.push(`You seem less drawn to ${categoryLabels[dislikedCategory]} ideas.`);
  }

  const likedTag = topDelta(likes, dislikes, (suggestion) => suggestion.tags);
  if (likedTag) {
    insights.push(`You often respond well to ${tagPhrase(likedTag)}.`);
  }

  const dislikedTag = topDelta(dislikes, likes, (suggestion) => suggestion.tags);
  if (dislikedTag) {
    insights.push(`${capitalize(tagPhrase(dislikedTag))} may be a weaker fit for you.`);
  }

  const likedSource = topDelta(likes, dislikes, (suggestion) => suggestion.source);
  if (likedSource === "event") {
    insights.push("Live events look promising for you based on your feedback.");
  } else if (likedSource === "productive") {
    insights.push("Productive ideas seem to land well when they fit the day.");
  }

  const likedDistance = average(likes.map((record) => record.suggestion?.distanceMiles));
  const dislikedDistance = average(dislikes.map((record) => record.suggestion?.distanceMiles));
  if (likedDistance !== null && likedDistance <= 2) {
    insights.push("Nearby ideas seem to work well for you.");
  } else if (likedDistance !== null && dislikedDistance !== null && dislikedDistance - likedDistance >= 2) {
    insights.push("Shorter trips seem to be a better fit than farther-away options.");
  }

  if (insights.length === 0) {
    insights.push("Your feedback is saved, but there is not a clear pattern yet.");
  }

  return insights.slice(0, 5);
}

function topDelta(
  positiveRecords: Array<FeedbackRecord & { suggestion: Suggestion | null }>,
  negativeRecords: Array<FeedbackRecord & { suggestion: Suggestion | null }>,
  readValue: (suggestion: Suggestion) => string | string[]
) {
  const positiveCounts = countValues(positiveRecords, readValue);
  const negativeCounts = countValues(negativeRecords, readValue);
  let bestValue: string | null = null;
  let bestScore = 0;

  for (const [value, count] of positiveCounts) {
    const score = count - (negativeCounts.get(value) ?? 0);
    if (count >= 1 && score > bestScore) {
      bestValue = value;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestValue : null;
}

function countValues(
  records: Array<FeedbackRecord & { suggestion: Suggestion | null }>,
  readValue: (suggestion: Suggestion) => string | string[]
) {
  const counts = new Map<string, number>();

  for (const record of records) {
    if (!record.suggestion) continue;
    const values = readValue(record.suggestion);
    for (const value of Array.isArray(values) ? values : [values]) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  return counts;
}

function average(values: Array<number | undefined>) {
  const numericValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numericValues.length === 0) return null;

  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function readableSuggestionId(id: string) {
  return id
    .replace(/^custom-/, "")
    .replace(/^ticketmaster-/, "")
    .split("-")
    .filter(Boolean)
    .join(" ");
}

function tagPhrase(tag: string) {
  const tagPhrases: Record<string, string> = {
    art: "art-focused plans",
    career: "career momentum",
    chores: "small life-admin wins",
    connection: "social connection plans",
    creative: "creative time",
    "date-friendly": "date-friendly outings",
    evening: "evening plans",
    explore: "exploratory plans",
    "fresh-air": "fresh-air plans",
    focus: "focused work sessions",
    food: "food-centered outings",
    indoors: "indoor plans",
    "low-energy": "low-energy plans",
    "low-planning": "low-planning ideas",
    momentum: "momentum-building tasks",
    movement: "movement-based plans",
    reset: "reset time",
    social: "group or social plans"
  };

  return tagPhrases[tag] ?? `${tag.replaceAll("-", " ")} ideas`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isSuggestionCategory(value: string): value is SuggestionCategory {
  return value in categoryLabels;
}
