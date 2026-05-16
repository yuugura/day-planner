import { getPool } from "./db";
import { demoSuggestions } from "./sample-data";
import type { CostLevel, EnergyLevel, SocialSetting, Suggestion, SuggestionCategory, WeatherCondition } from "./types";

type SuggestionRow = {
  id: string;
  owner_user_id?: string | null;
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

export type SuggestionInput = {
  title: string;
  category: SuggestionCategory;
  description: string;
  locationLabel: string;
  cost: CostLevel;
  distanceMiles: number;
  durationHours: number;
  energy: EnergyLevel;
  social: SocialSetting;
  weatherFit: WeatherCondition[];
  tags: string[];
  source: Suggestion["source"];
};

const categories: SuggestionCategory[] = ["outdoors", "culture", "food", "fitness", "social", "productive", "creative", "rest"];
const costs: CostLevel[] = ["free", "low", "medium", "high"];
const energies: EnergyLevel[] = ["low", "medium", "high"];
const socialSettings: SocialSetting[] = ["solo", "pair", "group", "flexible"];
const weatherConditions: WeatherCondition[] = ["clear", "cloudy", "rain", "snow", "hot", "cold"];
const sources: Suggestion["source"][] = ["event", "city", "everyday", "productive"];

function toSuggestion(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id ?? null,
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

async function ensureSuggestionSchema(db: NonNullable<ReturnType<typeof getPool>>) {
  await db.query("alter table suggestions add column if not exists owner_user_id text");
  await db.query("create index if not exists suggestions_owner_active_idx on suggestions (owner_user_id, active)");
}

function normalizeUserId(userId?: string | null) {
  return userId?.trim() || null;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }

  return value.trim();
}

function requiredNumber(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be a number.`);
  }

  return parsed;
}

function oneOf<T extends string>(value: unknown, field: string, options: readonly T[]) {
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new Error(`${field} is invalid.`);
  }

  return value as T;
}

function stringArray(value: unknown, field: string) {
  if (!Array.isArray(value)) throw new Error(`${field} must be a list.`);

  const values = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (values.length === 0) throw new Error(`${field} must include at least one item.`);

  return [...new Set(values)];
}

export function parseSuggestionInput(body: Record<string, unknown>): SuggestionInput {
  const distanceMiles = requiredNumber(body.distanceMiles, "Distance");
  const durationHours = requiredNumber(body.durationHours, "Duration");
  if (distanceMiles < 0) throw new Error("Distance cannot be negative.");
  if (durationHours <= 0) throw new Error("Duration must be greater than zero.");

  return {
    title: requiredString(body.title, "Title"),
    category: oneOf(body.category, "Category", categories),
    description: requiredString(body.description, "Description"),
    locationLabel: requiredString(body.locationLabel, "Location"),
    cost: oneOf(body.cost, "Cost", costs),
    distanceMiles,
    durationHours,
    energy: oneOf(body.energy, "Energy", energies),
    social: oneOf(body.social, "Social setting", socialSettings),
    weatherFit: stringArray(body.weatherFit, "Weather fit").map((item) =>
      oneOf(item, "Weather fit", weatherConditions)
    ),
    tags: stringArray(body.tags, "Tags"),
    source: oneOf(body.source, "Source", sources)
  };
}

export async function readSuggestionsWithSource(userId?: string | null): Promise<SuggestionsResult> {
  const db = getPool();
  if (!db) return { suggestions: demoSuggestions, source: "fallback" };
  const ownerUserId = normalizeUserId(userId);

  try {
    await ensureSuggestionSchema(db);
    const result = await db.query<SuggestionRow>(
      `select
        id,
        owner_user_id,
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
        and (owner_user_id is null or owner_user_id = $1)
      order by owner_user_id nulls first, source, title`,
      [ownerUserId]
    );

    return result.rows.length > 0
      ? { suggestions: result.rows.map(toSuggestion), source: "postgres" }
      : { suggestions: demoSuggestions, source: "fallback" };
  } catch (error) {
    console.error("Falling back to demo suggestions after database read failed.", error);
    return { suggestions: demoSuggestions, source: "fallback" };
  }
}

export async function readSuggestions(userId?: string | null): Promise<Suggestion[]> {
  const result = await readSuggestionsWithSource(userId);
  return result.suggestions;
}

export async function createSuggestion(ownerUserId: string, input: SuggestionInput): Promise<Suggestion> {
  const db = getPool();
  const normalizedOwner = normalizeUserId(ownerUserId);
  if (!db || !normalizedOwner) {
    throw new Error("A database connection and user id are required to save suggestions.");
  }

  await ensureSuggestionSchema(db);
  const id = `custom-${crypto.randomUUID()}`;
  const result = await db.query<SuggestionRow>(
    `insert into suggestions (
      id,
      owner_user_id,
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
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    returning
      id,
      owner_user_id,
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
      source`,
    [
      id,
      normalizedOwner,
      input.title,
      input.category,
      input.description,
      input.locationLabel,
      input.cost,
      input.distanceMiles,
      input.durationHours,
      input.energy,
      input.social,
      input.weatherFit,
      input.tags,
      input.source
    ]
  );

  return toSuggestion(result.rows[0]);
}

export async function updateSuggestion(id: string, ownerUserId: string, input: SuggestionInput): Promise<Suggestion | null> {
  const db = getPool();
  const normalizedOwner = normalizeUserId(ownerUserId);
  if (!db || !normalizedOwner) {
    throw new Error("A database connection and user id are required to save suggestions.");
  }

  await ensureSuggestionSchema(db);
  const result = await db.query<SuggestionRow>(
    `update suggestions set
      title = $3,
      category = $4,
      description = $5,
      location_label = $6,
      cost = $7,
      distance_miles = $8,
      duration_hours = $9,
      energy = $10,
      social = $11,
      weather_fit = $12,
      tags = $13,
      source = $14,
      updated_at = now()
    where id = $1
      and owner_user_id = $2
      and active = true
    returning
      id,
      owner_user_id,
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
      source`,
    [
      id,
      normalizedOwner,
      input.title,
      input.category,
      input.description,
      input.locationLabel,
      input.cost,
      input.distanceMiles,
      input.durationHours,
      input.energy,
      input.social,
      input.weatherFit,
      input.tags,
      input.source
    ]
  );

  return result.rows[0] ? toSuggestion(result.rows[0]) : null;
}

export async function archiveSuggestion(id: string, ownerUserId: string): Promise<boolean> {
  const db = getPool();
  const normalizedOwner = normalizeUserId(ownerUserId);
  if (!db || !normalizedOwner) {
    throw new Error("A database connection and user id are required to delete suggestions.");
  }

  await ensureSuggestionSchema(db);
  const result = await db.query(
    `update suggestions set
      active = false,
      updated_at = now()
    where id = $1
      and owner_user_id = $2
      and active = true`,
    [id, normalizedOwner]
  );

  return (result.rowCount ?? 0) > 0;
}
