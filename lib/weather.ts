import type { WeatherCondition, WeatherReport } from "./types";

type GeocodingResponse = {
  results?: Array<{
    name: string;
    admin1?: string;
    country?: string;
    latitude: number;
    longitude: number;
  }>;
};

type ForecastResponse = {
  current?: {
    time: string;
    temperature_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
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

export async function fetchWeatherForCity(city: string): Promise<WeatherReport> {
  const trimmedCity = city.trim();
  if (!trimmedCity) {
    throw new Error("City is required.");
  }

  const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodeUrl.searchParams.set("name", trimmedCity);
  geocodeUrl.searchParams.set("count", "1");
  geocodeUrl.searchParams.set("language", "en");
  geocodeUrl.searchParams.set("format", "json");

  const geocodeResponse = await fetch(geocodeUrl, { next: { revalidate: 3600 } });
  if (!geocodeResponse.ok) {
    throw new Error(`Could not geocode ${trimmedCity}.`);
  }

  const geocoding = (await geocodeResponse.json()) as GeocodingResponse;
  const place = geocoding.results?.[0];
  if (!place) {
    throw new Error(`No weather location found for ${trimmedCity}.`);
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(place.latitude));
  forecastUrl.searchParams.set("longitude", String(place.longitude));
  forecastUrl.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
  forecastUrl.searchParams.set("temperature_unit", "fahrenheit");
  forecastUrl.searchParams.set("wind_speed_unit", "mph");
  forecastUrl.searchParams.set("timezone", "auto");

  const forecastResponse = await fetch(forecastUrl, { next: { revalidate: 900 } });
  if (!forecastResponse.ok) {
    throw new Error(`Could not fetch weather for ${trimmedCity}.`);
  }

  const forecast = (await forecastResponse.json()) as ForecastResponse;
  if (!forecast.current) {
    throw new Error(`No current weather available for ${trimmedCity}.`);
  }

  const weather = describeWeatherCode(forecast.current.weather_code, forecast.current.temperature_2m);
  const displayParts = [place.name, place.admin1, place.country].filter(Boolean);

  return {
    city: place.name,
    displayName: displayParts.join(", "),
    condition: weather.condition,
    description: weather.description,
    temperatureF: Math.round(forecast.current.temperature_2m),
    windMph: Math.round(forecast.current.wind_speed_10m),
    weatherCode: forecast.current.weather_code,
    observedAt: forecast.current.time
  };
}
