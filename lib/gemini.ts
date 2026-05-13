import { GoogleGenerativeAI } from "@google/generative-ai";
import type { DayContext, ScoredSuggestion } from "./types";

export async function summarizePlan(context: DayContext, suggestions: ScoredSuggestion[]) {
  if (!process.env.GEMINI_API_KEY) {
    return `A good ${context.city || "local"} day starts with ${suggestions[0]?.title.toLowerCase() ?? "a flexible plan"}.`;
  }

  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });
  const top = suggestions.slice(0, 3).map((item) => `${item.title}: ${item.description}`).join("\n");
  const result = await model.generateContent(
    `Write one concise, practical sentence for a day plan in ${context.city}. Weather: ${context.weather}. Options:\n${top}`
  );

  return result.response.text().trim();
}
