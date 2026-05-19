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

type TicketmasterResponse = {
  _embedded?: {
    events?: TicketmasterEvent[];
  };
};

type TicketmasterEvent = {
  id: string;
  name: string;
  url?: string;
  dates?: {
    start?: {
      localDate?: string;
      localTime?: string;
    };
  };
  priceRanges?: Array<{
    min?: number;
  }>;
  classifications?: Array<{
    segment?: {
      name?: string;
    };
    genre?: {
      name?: string;
    };
  }>;
  _embedded?: {
    venues?: Array<{
      name?: string;
      distance?: number;
      units?: string;
      location?: {
        latitude?: string;
        longitude?: string;
      };
      city?: {
        name?: string;
      };
    }>;
  };
};

type TicketmasterVenue = NonNullable<NonNullable<TicketmasterEvent["_embedded"]>["venues"]>[number];

type EventTemplate = {
  category: SuggestionCategory;
  energy: EnergyLevel;
  social: SocialSetting;
  weatherFit: WeatherCondition[];
  tags: string[];
  durationHours: number;
};

const indoorWeather: WeatherCondition[] = ["cloudy", "rain", "snow", "hot", "cold"];
const allWeather: WeatherCondition[] = ["clear", "cloudy", "rain", "snow", "hot", "cold"];

export async function fetchEventSuggestions(place: PlaceLookup, limit = 6): Promise<Suggestion[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY?.trim();
  if (!apiKey || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return [];

  return getCached("events", eventCacheKey(place, limit), 30 * 60 * 1000, () => fetchEventSuggestionsUncached(place, limit, apiKey));
}

async function fetchEventSuggestionsUncached(place: PlaceLookup, limit: number, apiKey: string): Promise<Suggestion[]> {
  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("latlong", `${place.latitude},${place.longitude}`);
  url.searchParams.set("radius", "25");
  url.searchParams.set("unit", "miles");
  url.searchParams.set("size", String(limit));
  url.searchParams.set("sort", "date,asc");
  url.searchParams.set("locale", "*");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    next: { revalidate: 1800 }
  });

  if (!response.ok) {
    throw new Error(`Ticketmaster returned ${response.status} ${response.statusText || "status"}.`);
  }

  const payload = (await response.json()) as TicketmasterResponse;
  return (payload._embedded?.events ?? [])
    .map((event) => toSuggestion(event, place))
    .filter((suggestion): suggestion is Suggestion => suggestion !== null)
    .slice(0, limit);
}

function eventCacheKey(place: PlaceLookup, limit: number) {
  return stableCacheKey({
    latitude: Number(place.latitude.toFixed(2)),
    longitude: Number(place.longitude.toFixed(2)),
    limit
  });
}

export async function fetchEventSuggestionsSafe(place?: PlaceLookup | null, limit = 6): Promise<Suggestion[]> {
  if (!place) return [];

  try {
    return await fetchEventSuggestions(place, limit);
  } catch (error) {
    console.error("Skipping Ticketmaster events after lookup failed.", error);
    return [];
  }
}

function toSuggestion(event: TicketmasterEvent, place: PlaceLookup): Suggestion | null {
  const title = event.name?.trim();
  if (!title) return null;

  const venue = event._embedded?.venues?.[0];
  const classification = event.classifications?.[0];
  const segment = classification?.segment?.name ?? "";
  const genre = classification?.genre?.name ?? "";
  const template = classifyEvent(segment, genre);
  const distanceMiles = getDistanceMiles(venue, place);
  const cost = getCostLevel(event.priceRanges);
  const when = formatEventTime(event.dates?.start?.localDate, event.dates?.start?.localTime);
  const locationLabel = [venue?.name, venue?.city?.name].filter(Boolean).join(", ") || place.city;

  return {
    id: `ticketmaster-${event.id}`,
    ownerUserId: null,
    title,
    category: template.category,
    description: when
      ? `${when} at ${locationLabel}. A live event option if you want the day to have a fixed destination.`
      : `A live event at ${locationLabel} if you want the day to have a fixed destination.`,
    locationLabel,
    cost,
    distanceMiles,
    durationHours: template.durationHours,
    energy: template.energy,
    social: template.social,
    weatherFit: template.weatherFit,
    tags: [...new Set([...template.tags, genre.toLowerCase()].filter(Boolean))],
    source: "event",
    externalUrl: event.url
  };
}

function classifyEvent(segment: string, genre: string): EventTemplate {
  const normalizedSegment = segment.toLowerCase();
  const normalizedGenre = genre.toLowerCase();

  if (normalizedSegment.includes("sports")) {
    return {
      category: "social",
      energy: "high",
      social: "group",
      weatherFit: allWeather,
      tags: ["social", "event", "high-energy"],
      durationHours: 3
    };
  }

  if (normalizedGenre.includes("comedy")) {
    return {
      category: "social",
      energy: "medium",
      social: "pair",
      weatherFit: indoorWeather,
      tags: ["connection", "indoors", "event"],
      durationHours: 2
    };
  }

  if (normalizedSegment.includes("arts") || normalizedSegment.includes("theatre")) {
    return {
      category: "culture",
      energy: "low",
      social: "pair",
      weatherFit: indoorWeather,
      tags: ["art", "indoors", "date-friendly"],
      durationHours: 2.5
    };
  }

  return {
    category: "social",
    energy: "medium",
    social: "group",
    weatherFit: indoorWeather,
    tags: ["music", "social", "event"],
    durationHours: 2.5
  };
}

function getCostLevel(priceRanges: TicketmasterEvent["priceRanges"]): CostLevel {
  const minPrice = priceRanges?.find((range) => typeof range.min === "number")?.min;
  if (typeof minPrice !== "number") return "medium";
  if (minPrice <= 0) return "free";
  if (minPrice <= 30) return "low";
  if (minPrice <= 90) return "medium";
  return "high";
}

function getDistanceMiles(venue: TicketmasterVenue | undefined, place: PlaceLookup) {
  if (typeof venue?.distance === "number") {
    return Number((venue.units === "km" ? venue.distance * 0.621371 : venue.distance).toFixed(1));
  }

  const latitude = Number(venue?.location?.latitude);
  const longitude = Number(venue?.location?.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return Number(haversineMiles(place.latitude, place.longitude, latitude, longitude).toFixed(1));
  }

  return 4;
}

function formatEventTime(localDate?: string, localTime?: string) {
  if (!localDate) return "";

  const date = new Date(`${localDate}T${localTime || "12:00:00"}`);
  if (Number.isNaN(date.getTime())) return localDate;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: localTime ? "numeric" : undefined,
    minute: localTime ? "2-digit" : undefined
  });
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
