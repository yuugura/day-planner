import { NextResponse } from "next/server";
import { writeFeedback } from "@/lib/db";
import { extractFeatures } from "@/lib/recommender";
import { readSuggestions } from "@/lib/suggestions";
import type { DayContext, Suggestion } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    userId?: string;
    suggestionId?: string;
    liked?: boolean;
    context?: DayContext;
    suggestion?: Suggestion;
  };

  const userId = body.userId?.trim() || "anonymous-user";
  const suggestions = await readSuggestions(userId);
  const suggestion =
    suggestions.find((item) => item.id === body.suggestionId) ??
    (body.suggestion?.id === body.suggestionId ? body.suggestion : undefined);
  if (!suggestion || typeof body.liked !== "boolean" || !body.context) {
    return NextResponse.json({ error: "Missing suggestion, liked value, or context." }, { status: 400 });
  }

  await writeFeedback({
    userId,
    suggestionId: suggestion.id,
    liked: body.liked,
    features: extractFeatures(suggestion, body.context)
  });

  return NextResponse.json({ ok: true });
}
