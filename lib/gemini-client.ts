import { GoogleGenerativeAI } from "@google/generative-ai";

export const defaultGeminiModel = "gemini-2.0-flash";

export function getGeminiModel() {
  if (!process.env.GEMINI_API_KEY) return null;

  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client.getGenerativeModel({ model: process.env.GEMINI_MODEL || defaultGeminiModel });
}
