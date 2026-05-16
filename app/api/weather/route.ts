import { NextResponse } from "next/server";
import { fetchWeatherForCity, fetchWeatherForPlace } from "@/lib/weather";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city") || "";
  const latitude = Number(searchParams.get("latitude"));
  const longitude = Number(searchParams.get("longitude"));

  try {
    const weather =
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? await fetchWeatherForPlace({
            name: city || "Selected city",
            admin1: searchParams.get("admin1") || undefined,
            country: searchParams.get("country") || undefined,
            latitude,
            longitude
          })
        : await fetchWeatherForCity(city);
    return NextResponse.json({ weather });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch weather.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
