import { NextResponse } from "next/server";
import { searchCities } from "@/lib/weather";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || "";

  try {
    const cities = await searchCities(query, 5);
    return NextResponse.json({ cities, count: cities.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not search cities.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
