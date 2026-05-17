import { NextResponse } from "next/server";
import { resolvePersonalizationUserId } from "@/lib/auth";
import { readFeedback } from "@/lib/db";
import { buildFeedbackMemory } from "@/lib/memory";
import { readSuggestions } from "@/lib/suggestions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = await resolvePersonalizationUserId(request, searchParams.get("userId"));
  const [feedback, suggestions] = await Promise.all([readFeedback(userId), readSuggestions(userId)]);

  return NextResponse.json(buildFeedbackMemory(feedback, suggestions));
}
