import type {
  CostLevel,
  EnergyLevel,
  PlaceLookup,
  SocialSetting,
  Suggestion,
  SuggestionCategory,
  WeatherCondition
} from "./types";
import { getCached, stableCacheKey } from "./ttl-cache";

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

type PlaceTemplate = {
  category: SuggestionCategory;
  cost: CostLevel;
  durationHours: number;
  energy: EnergyLevel;
  social: SocialSetting;
  weatherFit: WeatherCondition[];
  tags: string[];
  description: (name: string) => string;
};

const allWeather: WeatherCondition[] = ["clear", "cloudy", "rain", "snow", "hot", "cold"];
const indoorWeather: WeatherCondition[] = ["cloudy", "rain", "snow", "hot", "cold"];
const outdoorWeather: WeatherCondition[] = ["clear", "cloudy", "cold"];
const defaultPlaceLimit = 32;

const overpassQuery = `
[out:json][timeout:9];
(
  node(around:6000,{{lat}},{{lon}})["leisure"~"^(park|garden|nature_reserve|sports_centre|fitness_centre)$"];
  way(around:6000,{{lat}},{{lon}})["leisure"~"^(park|garden|nature_reserve|sports_centre|fitness_centre)$"];
  relation(around:6000,{{lat}},{{lon}})["leisure"~"^(park|garden|nature_reserve|sports_centre|fitness_centre)$"];
  node(around:6000,{{lat}},{{lon}})["amenity"~"^(cafe|restaurant|fast_food|food_court|pub|bar|library|community_centre|marketplace|arts_centre|theatre|cinema)$"];
  way(around:6000,{{lat}},{{lon}})["amenity"~"^(cafe|restaurant|fast_food|food_court|pub|bar|library|community_centre|marketplace|arts_centre|theatre|cinema)$"];
  relation(around:6000,{{lat}},{{lon}})["amenity"~"^(cafe|restaurant|fast_food|food_court|pub|bar|library|community_centre|marketplace|arts_centre|theatre|cinema)$"];
  node(around:6000,{{lat}},{{lon}})["tourism"~"^(museum|gallery|attraction|viewpoint)$"];
  way(around:6000,{{lat}},{{lon}})["tourism"~"^(museum|gallery|attraction|viewpoint)$"];
  relation(around:6000,{{lat}},{{lon}})["tourism"~"^(museum|gallery|attraction|viewpoint)$"];
);
out center tags 120;
`;

const overpassEndpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter"
];

export async function fetchPlaceSuggestions(place: PlaceLookup, limit = defaultPlaceLimit, options: { refresh?: boolean } = {}): Promise<Suggestion[]> {
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return [];
  if (options.refresh) return fetchPlaceSuggestionsUncached(place, limit);

  return getCached("places", placeCacheKey(place, limit), 6 * 60 * 60 * 1000, () => fetchPlaceSuggestionsUncached(place, limit));
}

async function fetchPlaceSuggestionsUncached(place: PlaceLookup, limit: number): Promise<Suggestion[]> {
  const query = overpassQuery
    .replaceAll("{{lat}}", String(place.latitude))
    .replaceAll("{{lon}}", String(place.longitude));
  const body = new URLSearchParams({ data: query });
  let lastError: Error | null = null;

  for (const endpoint of overpassEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "DayPlannerLocal/0.1 (local development)"
        },
        next: { revalidate: 3600 }
      });

      if (!response.ok) {
        lastError = new Error(`Overpass returned ${response.status} ${response.statusText || "status"} from ${endpoint}.`);
        continue;
      }

      const payload = (await response.json()) as OverpassResponse;
      return mapOverpassElements(payload, place, limit);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown Overpass lookup error.");
    }
  }

  throw new Error(`Could not fetch places for ${place.city}. ${lastError?.message ?? ""}`.trim());
}

function placeCacheKey(place: PlaceLookup, limit: number) {
  return stableCacheKey({
    latitude: Number(place.latitude.toFixed(3)),
    longitude: Number(place.longitude.toFixed(3)),
    limit
  });
}

function normalizePlaceName(name: string) {
  const genericWords = new Set(["bar", "cafe", "coffee", "restaurant", "the"]);
  const baseName = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/\s[-|/]\s/)[0];

  return baseName
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !genericWords.has(word))
    .join(" ");
}

function diversifyPlaces(suggestions: Suggestion[], limit: number) {
  const categoriesByDistance = Array.from(new Set(
    [...suggestions]
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .map((suggestion) => suggestion.category)
  ));
  const suggestionsByCategory = new Map<SuggestionCategory, Suggestion[]>();

  for (const category of categoriesByDistance) {
    suggestionsByCategory.set(
      category,
      suggestions
        .filter((suggestion) => suggestion.category === category)
        .sort((a, b) => a.distanceMiles - b.distanceMiles)
    );
  }

  const diversified: Suggestion[] = [];
  let categoryIndex = 0;

  while (diversified.length < limit && suggestionsByCategory.size > 0) {
    const category = categoriesByDistance[categoryIndex % categoriesByDistance.length];
    const categorySuggestions = suggestionsByCategory.get(category);

    if (categorySuggestions?.length) {
      diversified.push(categorySuggestions.shift()!);
    }

    if (categorySuggestions?.length === 0) {
      suggestionsByCategory.delete(category);
    }

    categoryIndex += 1;
  }

  return diversified;
}

function mapOverpassElements(payload: OverpassResponse, place: PlaceLookup, limit: number): Suggestion[] {
  const seenNames = new Set<string>();

  const suggestions = (payload.elements ?? [])
    .map((element) => toSuggestion(element, place))
    .filter((suggestion): suggestion is Suggestion => {
      if (!suggestion) return false;
      const normalizedName = normalizePlaceName(suggestion.title);
      if (seenNames.has(normalizedName)) return false;
      seenNames.add(normalizedName);
      return true;
    });

  return diversifyPlaces(suggestions, limit);
}

export async function fetchPlaceSuggestionsSafe(
  place?: PlaceLookup | null,
  limit = defaultPlaceLimit,
  options: { refresh?: boolean } = {}
): Promise<Suggestion[]> {
  if (!place) return [];

  try {
    return await fetchPlaceSuggestions(place, limit, options);
  } catch (error) {
    console.error("Skipping OpenStreetMap places after lookup failed.", error);
    return [];
  }
}

function toSuggestion(element: OverpassElement, place: PlaceLookup): Suggestion | null {
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  const coordinates = getCoordinates(element);
  if (!name || !coordinates) return null;

  const template = classifyPlace(tags);
  if (!template) return null;

  const distanceMiles = haversineMiles(place.latitude, place.longitude, coordinates.latitude, coordinates.longitude);
  if (distanceMiles > 8) return null;

  return {
    id: `osm-${element.type}-${element.id}`,
    ownerUserId: null,
    title: name,
    category: template.category,
    description: template.description(name),
    locationLabel: formatLocationLabel(name, tags, place.city),
    cost: template.cost,
    distanceMiles: Number(distanceMiles.toFixed(1)),
    durationHours: template.durationHours,
    energy: template.energy,
    social: template.social,
    weatherFit: template.weatherFit,
    tags: template.tags,
    source: "city"
  };
}

function getCoordinates(element: OverpassElement) {
  if (typeof element.lat === "number" && typeof element.lon === "number") {
    return { latitude: element.lat, longitude: element.lon };
  }

  if (element.center) {
    return { latitude: element.center.lat, longitude: element.center.lon };
  }

  return null;
}

function classifyPlace(tags: Record<string, string>): PlaceTemplate | null {
  const amenity = tags.amenity;
  const leisure = tags.leisure;
  const tourism = tags.tourism;

  if (["park", "garden", "nature_reserve"].includes(leisure) || tourism === "viewpoint") {
    return {
      category: "outdoors",
      cost: "free",
      durationHours: 1.5,
      energy: "medium",
      social: "flexible",
      weatherFit: outdoorWeather,
      tags: ["fresh-air", "explore", "low-planning"],
      description: (name) => `Spend easy time outside at ${name}, with enough structure to get out the door and enough slack to wander.`
    };
  }

  if (["cafe", "restaurant", "fast_food", "food_court", "pub", "bar", "marketplace"].includes(amenity)) {
    return {
      category: "food",
      cost: ["marketplace", "fast_food", "food_court"].includes(amenity) ? "low" : "medium",
      durationHours: amenity === "marketplace" ? 1.25 : 1,
      energy: "low",
      social: "flexible",
      weatherFit: allWeather,
      tags: ["food", "low-planning", "explore"],
      description: (name) => `Make ${name} the anchor for a simple food stop, then leave room for a short wander nearby.`
    };
  }

  if (amenity === "library") {
    return {
      category: "productive",
      cost: "free",
      durationHours: 1.5,
      energy: "low",
      social: "solo",
      weatherFit: allWeather,
      tags: ["focus", "indoors", "low-planning"],
      description: (name) => `Use ${name} for one calm focus block, a browse, or a quiet reset away from home.`
    };
  }

  if (["museum", "gallery", "attraction"].includes(tourism) || ["arts_centre", "theatre", "cinema"].includes(amenity)) {
    return {
      category: "culture",
      cost: tourism === "attraction" ? "low" : "medium",
      durationHours: 2,
      energy: "low",
      social: "pair",
      weatherFit: indoorWeather,
      tags: ["art", "indoors", "date-friendly"],
      description: (name) => `Pick one focused cultural stop at ${name} instead of trying to over-plan the whole outing.`
    };
  }

  if (["sports_centre", "fitness_centre"].includes(leisure)) {
    return {
      category: "fitness",
      cost: "medium",
      durationHours: 1.25,
      energy: "high",
      social: "group",
      weatherFit: indoorWeather,
      tags: ["movement", "indoors", "social"],
      description: (name) => `Check ${name} for a drop-in session, class, or movement block that gives the day momentum.`
    };
  }

  if (amenity === "community_centre") {
    return {
      category: "social",
      cost: "low",
      durationHours: 1.25,
      energy: "medium",
      social: "group",
      weatherFit: allWeather,
      tags: ["connection", "low-planning", "community"],
      description: (name) => `Use ${name} as a low-pressure community stop, especially if you want the day to include other people.`
    };
  }

  return null;
}

function formatLocationLabel(name: string, tags: Record<string, string>, city: string) {
  const street = tags["addr:street"];
  const houseNumber = tags["addr:housenumber"];
  const address = [houseNumber, street].filter(Boolean).join(" ");

  return address ? `${name}, ${address}` : `${name}, ${city}`;
}

function haversineMiles(startLat: number, startLon: number, endLat: number, endLon: number) {
  const earthRadiusMiles = 3958.8;
  const deltaLat = toRadians(endLat - startLat);
  const deltaLon = toRadians(endLon - startLon);
  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
