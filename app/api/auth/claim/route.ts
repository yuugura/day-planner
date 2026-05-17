import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { claimFeedbackUser } from "@/lib/db";
import { claimSuggestionsUser } from "@/lib/suggestions";

export async function POST(request: Request) {
  const session = await getAuthSession(request);
  if (!session) return NextResponse.json({ error: "Sign in before claiming anonymous data." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { anonymousUserId?: string };
  const anonymousUserId = body.anonymousUserId?.trim();
  if (!anonymousUserId || anonymousUserId === session.user.id) {
    return NextResponse.json({ claimedSuggestions: 0, claimedFeedback: 0 });
  }

  const [claimedSuggestions, claimedFeedback] = await Promise.all([
    claimSuggestionsUser(anonymousUserId, session.user.id),
    claimFeedbackUser(anonymousUserId, session.user.id)
  ]);

  return NextResponse.json({ claimedSuggestions, claimedFeedback });
}
