import { NextResponse } from "next/server";
import { fetchWeatherForCity } from "@/lib/weather";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city") || "";

  try {
    const weather = await fetchWeatherForCity(city);
    return NextResponse.json({ weather });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch weather.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
