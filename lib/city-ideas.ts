import { generateGroundedContent } from "./gemini-client";
import { getPool } from "./db";
import { getCached, stableCacheKey } from "./ttl-cache";
import type {
  CostLevel,
  DayContext,
  EnergyLevel,
  SocialSetting,
  Suggestion,
  SuggestionCategory,
  WeatherCondition
} from "./types";

export type CityIdeaDraft = {
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

export type CityIdeaStatus = "memory-cache" | "persistent-cache" | "grounded" | "fallback";

export type CityIdeaResult = {
  drafts: CityIdeaDraft[];
  status: CityIdeaStatus;
};

const categories: SuggestionCategory[] = ["outdoors", "culture", "food", "fitness", "social", "productive", "creative", "rest"];
const costs: CostLevel[] = ["free", "low", "medium", "high"];
const energies: EnergyLevel[] = ["low", "medium", "high"];
const socialSettings: SocialSetting[] = ["solo", "pair", "group", "flexible"];
const weatherConditions: WeatherCondition[] = ["clear", "cloudy", "rain", "snow", "hot", "cold"];
const sources: Suggestion["source"][] = ["event", "city", "everyday", "productive"];
const persistentCacheTtlMs = 7 * 24 * 60 * 60 * 1000;

type CityIdeaCacheRow = {
  drafts: CityIdeaDraft[];
};

export async function generateCityIdeaDrafts(context: DayContext): Promise<CityIdeaDraft[]> {
  const result = await generateCityIdeaResult(context);
  return result.drafts;
}

export async function generateCityIdeaResult(context: DayContext): Promise<CityIdeaResult> {
  const cacheKey = cityIdeasCacheKey(context);
  let loadedFresh = false;
  const cachedResult = await getCached("city-ideas", cacheKey, 6 * 60 * 60 * 1000, async () => {
    loadedFresh = true;
    return generateCityIdeaResultUncached(context);
  });

  return !loadedFresh && (cachedResult.status === "persistent-cache" || cachedResult.status === "grounded" || cachedResult.status === "fallback")
    ? { ...cachedResult, status: "memory-cache" }
    : cachedResult;
}

async function generateCityIdeaResultUncached(context: DayContext): Promise<CityIdeaResult> {
  const cacheKey = cityIdeasCacheKey(context);
  const cachedDrafts = await readPersistentCityIdeaCache(cacheKey);
  if (cachedDrafts) return { drafts: cachedDrafts, status: "persistent-cache" };

  try {
    const text = await generateGroundedContent(
      `Use Google Search to identify common activities, neighborhoods, local plan patterns, and recurring advice for what people like to do in ${context.city}.
Generate 8 practical day-plan suggestion drafts for ${context.city}.
Do not invent exact live events, opening hours, or facts that require confirmation.
Do not copy source wording. Summarize common patterns into original, practical plan ideas.
Current context: weather=${context.weather}, temperatureF=${context.temperatureF}, local time bucket=${context.timeOfDay}, availableHours=${context.availableHours}, budget=${context.budget}, energy=${context.energy}, social=${context.social}.
Return only JSON with this shape:
{"suggestions":[{"title":"...","category":"outdoors|culture|food|fitness|social|productive|creative|rest","description":"...","locationLabel":"...","cost":"free|low|medium|high","distanceMiles":1.5,"durationHours":1.25,"energy":"low|medium|high","social":"solo|pair|group|flexible","weatherFit":["clear"],"tags":["midday","food"],"source":"city|event|everyday|productive"}]}
Descriptions should be specific enough to feel city-aware, but generic enough that OpenStreetMap or Ticketmaster can supply concrete places later.`
    );
    if (!text) return { drafts: fallbackCityIdeas(context), status: "fallback" };

    const drafts = normalizeDrafts(extractJson(text)).slice(0, 8);
    await writePersistentCityIdeaCache(cacheKey, context, drafts);
    return { drafts, status: "grounded" };
  } catch (error) {
    console.error("Falling back to local city ideas after Gemini failed.", error);
    return { drafts: fallbackCityIdeas(context), status: "fallback" };
  }
}

async function ensureCityIdeaCacheSchema(db: NonNullable<ReturnType<typeof getPool>>) {
  await db.query(`
    create table if not exists city_idea_cache (
      cache_key text primary key,
      city text not null,
      context jsonb not null,
      drafts jsonb not null,
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await db.query("create index if not exists city_idea_cache_expires_idx on city_idea_cache (expires_at)");
}

async function readPersistentCityIdeaCache(cacheKey: string) {
  const db = getPool();
  if (!db) return null;

  try {
    await ensureCityIdeaCacheSchema(db);
    const result = await db.query<CityIdeaCacheRow>(
      "select drafts from city_idea_cache where cache_key = $1 and expires_at > now()",
      [cacheKey]
    );
    const drafts = result.rows[0]?.drafts;
    return Array.isArray(drafts) ? normalizeDrafts({ suggestions: drafts }).slice(0, 8) : null;
  } catch (error) {
    console.error("Skipping persistent city idea cache after database read failed.", error);
    return null;
  }
}

async function writePersistentCityIdeaCache(cacheKey: string, context: DayContext, drafts: CityIdeaDraft[]) {
  const db = getPool();
  if (!db || drafts.length === 0) return;

  try {
    await ensureCityIdeaCacheSchema(db);
    await db.query(
      `insert into city_idea_cache (cache_key, city, context, drafts, expires_at)
       values ($1, $2, $3::jsonb, $4::jsonb, $5)
       on conflict (cache_key) do update set
         city = excluded.city,
         context = excluded.context,
         drafts = excluded.drafts,
         expires_at = excluded.expires_at,
         updated_at = now()`,
      [
        cacheKey,
        context.city,
        JSON.stringify({
          city: context.city,
          weather: context.weather,
          timeOfDay: context.timeOfDay,
          availableHours: context.availableHours,
          budget: context.budget,
          energy: context.energy,
          social: context.social
        }),
        JSON.stringify(drafts),
        new Date(Date.now() + persistentCacheTtlMs)
      ]
    );
  } catch (error) {
    console.error("Skipping persistent city idea cache after database write failed.", error);
  }
}

function cityIdeasCacheKey(context: DayContext) {
  return stableCacheKey({
    city: context.city.trim().toLowerCase(),
    weather: context.weather,
    timeOfDay: context.timeOfDay,
    availableHours: context.availableHours,
    budget: context.budget,
    energy: context.energy,
    social: context.social
  });
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("City idea response did not include JSON.");
  return JSON.parse(raw.slice(start, end + 1)) as { suggestions?: unknown[] };
}

function normalizeDrafts(payload: { suggestions?: unknown[] }) {
  if (!Array.isArray(payload.suggestions)) throw new Error("City idea response did not include suggestions.");

  return payload.suggestions.map((item) => normalizeDraft(item)).filter((item): item is CityIdeaDraft => Boolean(item));
}

function normalizeDraft(item: unknown): CityIdeaDraft | null {
  if (!item || typeof item !== "object") return null;
  const value = item as Record<string, unknown>;
  const title = cleanString(value.title);
  const description = cleanString(value.description);
  const locationLabel = cleanString(value.locationLabel);
  if (!title || !description || !locationLabel) return null;

  const weatherFit = normalizeStringList(value.weatherFit, weatherConditions);
  const tags = normalizeTags(value.tags);

  return {
    title,
    category: oneOf(value.category, categories, "culture"),
    description,
    locationLabel,
    cost: oneOf(value.cost, costs, "low"),
    distanceMiles: clampNumber(value.distanceMiles, 0, 12, 2),
    durationHours: clampNumber(value.durationHours, 0.5, 8, 1.5),
    energy: oneOf(value.energy, energies, "medium"),
    social: oneOf(value.social, socialSettings, "flexible"),
    weatherFit: weatherFit.length ? weatherFit : [oneOf(undefined, weatherConditions, "cloudy")],
    tags: tags.length ? tags : ["low-planning"],
    source: oneOf(value.source, sources, "city")
  };
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 240) : "";
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T) {
  return typeof value === "string" && options.includes(value as T) ? (value as T) : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeStringList<T extends string>(value: unknown, options: readonly T[]) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is T => typeof item === "string" && options.includes(item as T)))];
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase().replace(/\s+/g, "-"))
        .filter(Boolean)
        .slice(0, 8)
    )
  ];
}

export function cityIdeaDraftsToSuggestions(context: DayContext, drafts: CityIdeaDraft[]): Suggestion[] {
  return drafts.map((draft, index) => ({
    id: `city-idea-${slugify(`${context.city}-${draft.title}`)}-${index}`,
    ownerUserId: null,
    title: draft.title,
    category: draft.category,
    description: draft.description,
    locationLabel: draft.locationLabel,
    cost: draft.cost,
    distanceMiles: draft.distanceMiles,
    durationHours: draft.durationHours,
    energy: draft.energy,
    social: draft.social,
    weatherFit: draft.weatherFit,
    tags: [...new Set(["city-idea", ...draft.tags])],
    source: draft.source === "event" ? "city" : draft.source
  }));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function fallbackCityIdeas(context: DayContext): CityIdeaDraft[] {
  const city = context.city || "your city";
  const timeTag = context.timeOfDay;
  const weatherFit: WeatherCondition[] =
    context.weather === "rain" || context.weather === "snow" || context.weather === "hot"
      ? [context.weather, "cloudy", "cold"]
      : [context.weather, "clear", "cloudy"];

  return [
    {
      title: `Find a ${city} neighborhood anchor`,
      category: "culture",
      description: `Pick one walkable ${city} neighborhood and build the plan around a bookstore, gallery, market, library, or small local landmark.`,
      locationLabel: "Walkable neighborhood anchor",
      cost: "low",
      distanceMiles: 2,
      durationHours: 2,
      energy: "medium",
      social: "flexible",
      weatherFit,
      tags: [timeTag, "explore", "low-planning"],
      source: "city"
    },
    {
      title: `Try a ${city} food pocket`,
      category: "food",
      description: "Choose a food hall, bakery strip, casual restaurant cluster, or market area and keep the goal to one good bite.",
      locationLabel: "Food hall, market, or restaurant strip",
      cost: context.budget === "free" ? "low" : context.budget,
      distanceMiles: 2.5,
      durationHours: 1.25,
      energy: "low",
      social: "flexible",
      weatherFit: ["clear", "cloudy", "hot", "cold", "rain"],
      tags: [timeTag, context.timeOfDay === "evening" ? "dinner" : "lunch", "food"],
      source: "city"
    },
    {
      title: `Look for a small ${city} event`,
      category: "social",
      description: "Search for a library talk, gallery opening, open mic, meetup, local sports night, or community event with a clear start time.",
      locationLabel: "Community venue or event space",
      cost: "low",
      distanceMiles: 4,
      durationHours: 2,
      energy: "medium",
      social: "group",
      weatherFit: ["clear", "cloudy", "rain", "snow", "hot", "cold"],
      tags: [timeTag, "connection", "low-cost"],
      source: "event"
    },
    {
      title: "Make the weather the plan",
      category: context.weather === "rain" || context.weather === "snow" || context.weather === "hot" ? "rest" : "outdoors",
      description:
        context.weather === "rain" || context.weather === "snow" || context.weather === "hot"
          ? "Pick an indoor public place with a little atmosphere and use the weather as permission to slow down."
          : "Pick a park, waterfront, viewpoint, trail, or main street and let the good weather do most of the work.",
      locationLabel: context.weather === "rain" || context.weather === "snow" || context.weather === "hot" ? "Indoor public place" : "Outdoor route or viewpoint",
      cost: "free",
      distanceMiles: 2,
      durationHours: 1.5,
      energy: "low",
      social: "solo",
      weatherFit,
      tags: [timeTag, "reset", context.weather === "rain" ? "rainy-day" : "fresh-air"],
      source: "everyday"
    }
  ];
}
