import { NextResponse } from "next/server";
import {
  archiveSuggestion,
  createSuggestion,
  parseSuggestionInput,
  readSuggestionsWithSource,
  updateSuggestion
} from "@/lib/suggestions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const result = await readSuggestionsWithSource(userId);

  return NextResponse.json({
    suggestions: result.suggestions,
    count: result.suggestions.length,
    source: result.source
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId : "";
    const suggestion = await createSuggestion(userId, parseSuggestionInput(body));

    return NextResponse.json({ suggestion }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create suggestion." },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!id) throw new Error("Suggestion id is required.");

    const suggestion = await updateSuggestion(id, userId, parseSuggestionInput(body));
    if (!suggestion) {
      return NextResponse.json({ error: "Suggestion was not found for this user." }, { status: 404 });
    }

    return NextResponse.json({ suggestion });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update suggestion." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!id) throw new Error("Suggestion id is required.");

    const deleted = await archiveSuggestion(id, userId);
    if (!deleted) {
      return NextResponse.json({ error: "Suggestion was not found for this user." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete suggestion." },
      { status: 400 }
    );
  }
}
