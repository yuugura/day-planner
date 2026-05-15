import { NextResponse } from "next/server";
import { readSuggestionsWithSource } from "@/lib/suggestions";

export async function GET() {
  const result = await readSuggestionsWithSource();

  return NextResponse.json({
    suggestions: result.suggestions,
    count: result.suggestions.length,
    source: result.source
  });
}
