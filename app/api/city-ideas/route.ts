import { NextResponse } from "next/server";
import { generateCityIdeaDrafts } from "@/lib/city-ideas";
import type { DayContext } from "@/lib/types";

const defaultContext: DayContext = {
  city: "Toronto",
  weather: "cloudy",
  temperatureF: 55,
  localHour: 12,
  timeOfDay: "midday",
  timeZone: "America/Toronto",
  availableHours: 3,
  budget: "low",
  energy: "medium",
  social: "flexible",
  preferenceTags: ["fresh-air", "food", "low-planning"]
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<DayContext>;
    const context: DayContext = {
      ...defaultContext,
      ...body,
      city: body.city?.trim() || defaultContext.city,
      preferenceTags: Array.isArray(body.preferenceTags) ? body.preferenceTags : defaultContext.preferenceTags
    };
    const drafts = await generateCityIdeaDrafts(context);

    return NextResponse.json({ drafts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate city ideas." },
      { status: 400 }
    );
  }
}
