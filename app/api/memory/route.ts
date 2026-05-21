import { NextResponse } from "next/server";
import { resolvePersonalizationUserId } from "@/lib/auth";
import { deleteFeedbackForUser, readFeedback } from "@/lib/db";
import { buildFeedbackMemory } from "@/lib/memory";
import { readSuggestions } from "@/lib/suggestions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = await resolvePersonalizationUserId(request, searchParams.get("userId"));
  const [feedback, suggestions] = await Promise.all([readFeedback(userId), readSuggestions(userId)]);

  return NextResponse.json(buildFeedbackMemory(feedback, suggestions));
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  const userId = await resolvePersonalizationUserId(request, body.userId);
  const deletedCount = await deleteFeedbackForUser(userId);
  const suggestions = await readSuggestions(userId);

  return NextResponse.json({
    deletedCount,
    memory: buildFeedbackMemory([], suggestions)
  });
}
