import type { CitySearchResult, TimeOfDay, WeatherCondition, WeatherReport } from "./types";
import { getCached, stableCacheKey } from "./ttl-cache";

type GeocodingResponse = {
  results?: Array<{
    id?: number;
    name: string;
    admin1?: string;
    country?: string;
    latitude: number;
    longitude: number;
  }>;
};

type ForecastResponse = {
  timezone?: string;
  timezone_abbreviation?: string;
  current?: {
    time: string;
    temperature_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
};

type WeatherPlace = {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
};

export function describeWeatherCode(code: number, temperatureF: number): {
  condition: WeatherCondition;
  description: string;
} {
  if (temperatureF >= 85) return { condition: "hot", description: "Hot" };
  if (temperatureF <= 28) return { condition: "cold", description: "Cold" };

  if (code === 0) return { condition: "clear", description: "Clear" };
  if ([1, 2, 3, 45, 48].includes(code)) return { condition: "cloudy", description: "Cloudy" };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || [95, 96, 99].includes(code)) {
    return { condition: "rain", description: "Rainy" };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return { condition: "snow", description: "Snowy" };
  }

  return { condition: "cloudy", description: "Mixed" };
}

export function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function getLocalHour(localTime: string) {
  const hour = Number(localTime.match(/T(\d{2})/)?.[1]);
  return Number.isFinite(hour) ? hour : new Date().getHours();
}

export async function searchCities(query: string, count = 5): Promise<CitySearchResult[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return [];

  return getCached("city-search", stableCacheKey({ query: trimmedQuery.toLowerCase(), count }), 24 * 60 * 60 * 1000, () =>
    searchCitiesUncached(trimmedQuery, count)
  );
}

async function searchCitiesUncached(trimmedQuery: string, count: number): Promise<CitySearchResult[]> {
  const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodeUrl.searchParams.set("name", trimmedQuery);
  geocodeUrl.searchParams.set("count", String(count));
  geocodeUrl.searchParams.set("language", "en");
  geocodeUrl.searchParams.set("format", "json");

  const geocodeResponse = await fetch(geocodeUrl, { next: { revalidate: 3600 } });
  if (!geocodeResponse.ok) {
    throw new Error(`Could not search cities for ${trimmedQuery}.`);
  }

  const geocoding = (await geocodeResponse.json()) as GeocodingResponse;
  return (
    geocoding.results?.map((place) => {
      const displayParts = [place.name, place.admin1, place.country].filter(Boolean);

      return {
        id: String(place.id ?? `${place.latitude},${place.longitude}`),
        name: place.name,
        admin1: place.admin1,
        country: place.country,
        latitude: place.latitude,
        longitude: place.longitude,
        displayName: displayParts.join(", ")
      };
    }) ?? []
  );
}

export async function fetchWeatherForCity(city: string): Promise<WeatherReport> {
  const trimmedCity = city.trim();
  if (!trimmedCity) {
    throw new Error("City is required.");
  }

  const places = await searchCities(trimmedCity, 1);
  const place = places[0];
  if (!place) {
    throw new Error(`No weather location found for ${trimmedCity}.`);
  }

  return fetchWeatherForPlace(place);
}

export async function fetchWeatherForPlace(place: WeatherPlace): Promise<WeatherReport> {
  return getCached("weather", weatherCacheKey(place), 15 * 60 * 1000, () => fetchWeatherForPlaceUncached(place));
}

async function fetchWeatherForPlaceUncached(place: WeatherPlace): Promise<WeatherReport> {
  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(place.latitude));
  forecastUrl.searchParams.set("longitude", String(place.longitude));
  forecastUrl.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
  forecastUrl.searchParams.set("temperature_unit", "fahrenheit");
  forecastUrl.searchParams.set("wind_speed_unit", "mph");
  forecastUrl.searchParams.set("timezone", "auto");

  const forecastResponse = await fetch(forecastUrl, { next: { revalidate: 900 } });
  if (!forecastResponse.ok) {
    throw new Error(`Could not fetch weather for ${place.name}.`);
  }

  const forecast = (await forecastResponse.json()) as ForecastResponse;
  if (!forecast.current) {
    throw new Error(`No current weather available for ${place.name}.`);
  }

  const weather = describeWeatherCode(forecast.current.weather_code, forecast.current.temperature_2m);
  const localHour = getLocalHour(forecast.current.time);
  const displayParts = [place.name, place.admin1, place.country].filter(Boolean);

  return {
    city: place.name,
    displayName: displayParts.join(", "),
    condition: weather.condition,
    description: weather.description,
    temperatureF: Math.round(forecast.current.temperature_2m),
    windMph: Math.round(forecast.current.wind_speed_10m),
    weatherCode: forecast.current.weather_code,
    observedAt: forecast.current.time,
    localHour,
    timeOfDay: getTimeOfDay(localHour),
    timeZone: forecast.timezone,
    timeZoneAbbreviation: forecast.timezone_abbreviation
  };
}

function weatherCacheKey(place: WeatherPlace) {
  return stableCacheKey({
    latitude: Number(place.latitude.toFixed(3)),
    longitude: Number(place.longitude.toFixed(3)),
    name: place.name.trim().toLowerCase()
  });
}
