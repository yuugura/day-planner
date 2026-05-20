import { GoogleGenerativeAI } from "@google/generative-ai";

export const defaultGeminiModel = "gemini-2.0-flash";
export const defaultGroundedGeminiModel = "gemini-2.5-flash-lite";

export function getGeminiModel() {
  if (!process.env.GEMINI_API_KEY) return null;

  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client.getGenerativeModel({ model: process.env.GEMINI_MODEL || defaultGeminiModel });
}

type GenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

export async function generateGroundedContent(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.GEMINI_GROUNDED_MODEL || defaultGroundedGeminiModel;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }]
      })
    }
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Grounded Gemini request failed with ${response.status} ${response.statusText || "status"}${details ? `: ${details.slice(0, 600)}` : ""}.`
    );
  }

  const payload = (await response.json()) as GenerateContentResponse;
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() || "";
}
