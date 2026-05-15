import { getPool } from "./db";
import { demoSuggestions } from "./sample-data";
import type { Suggestion } from "./types";

type SuggestionRow = {
  id: string;
  title: string;
  category: Suggestion["category"];
  description: string;
  location_label: string;
  cost: Suggestion["cost"];
  distance_miles: string | number;
  duration_hours: string | number;
  energy: Suggestion["energy"];
  social: Suggestion["social"];
  weather_fit: Suggestion["weatherFit"];
  tags: string[];
  source: Suggestion["source"];
};

export type SuggestionsResult = {
  suggestions: Suggestion[];
  source: "postgres" | "fallback";
};

function toSuggestion(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    locationLabel: row.location_label,
    cost: row.cost,
    distanceMiles: Number(row.distance_miles),
    durationHours: Number(row.duration_hours),
    energy: row.energy,
    social: row.social,
    weatherFit: row.weather_fit,
    tags: row.tags,
    source: row.source
  };
}

export async function readSuggestionsWithSource(): Promise<SuggestionsResult> {
  const db = getPool();
  if (!db) return { suggestions: demoSuggestions, source: "fallback" };

  try {
    const result = await db.query<SuggestionRow>(
      `select
        id,
        title,
        category,
        description,
        location_label,
        cost,
        distance_miles,
        duration_hours,
        energy,
        social,
        weather_fit,
        tags,
        source
      from suggestions
      where active = true
      order by source, title`
    );

    return result.rows.length > 0
      ? { suggestions: result.rows.map(toSuggestion), source: "postgres" }
      : { suggestions: demoSuggestions, source: "fallback" };
  } catch (error) {
    console.error("Falling back to demo suggestions after database read failed.", error);
    return { suggestions: demoSuggestions, source: "fallback" };
  }
}

export async function readSuggestions(): Promise<Suggestion[]> {
  const result = await readSuggestionsWithSource();
  return result.suggestions;
}
