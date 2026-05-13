import { NextResponse } from "next/server";
import { readFeedback } from "@/lib/db";
import { summarizePlan } from "@/lib/gemini";
import { rankSuggestions } from "@/lib/recommender";
import { demoSuggestions } from "@/lib/sample-data";
import type { DayContext } from "@/lib/types";

const defaultContext: DayContext = {
  city: "Toronto",
  weather: "cloudy",
  temperatureF: 55,
  availableHours: 3,
  budget: "low",
  energy: "medium",
  social: "flexible",
  preferenceTags: ["fresh-air", "food", "low-planning"]
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<DayContext> & { userId?: string };
  const context: DayContext = {
    ...defaultContext,
    ...body,
    city: body.city?.trim() || defaultContext.city,
    preferenceTags: Array.isArray(body.preferenceTags) ? body.preferenceTags : defaultContext.preferenceTags
  };
  const userId = body.userId || "demo-user";
  const feedback = await readFeedback(userId);
  const suggestions = rankSuggestions(demoSuggestions, context, feedback);
  const summary = await summarizePlan(context, suggestions).catch(() => "");

  return NextResponse.json({
    context,
    summary,
    suggestions,
    trainingExamples: feedback.length
  });
}
