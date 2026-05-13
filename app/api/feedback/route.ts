import { NextResponse } from "next/server";
import { writeFeedback } from "@/lib/db";
import { extractFeatures } from "@/lib/recommender";
import { demoSuggestions } from "@/lib/sample-data";
import type { DayContext } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    userId?: string;
    suggestionId?: string;
    liked?: boolean;
    context?: DayContext;
  };

  const suggestion = demoSuggestions.find((item) => item.id === body.suggestionId);
  if (!suggestion || typeof body.liked !== "boolean" || !body.context) {
    return NextResponse.json({ error: "Missing suggestion, liked value, or context." }, { status: 400 });
  }

  await writeFeedback({
    userId: body.userId || "demo-user",
    suggestionId: suggestion.id,
    liked: body.liked,
    features: extractFeatures(suggestion, body.context)
  });

  return NextResponse.json({ ok: true });
}
