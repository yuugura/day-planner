import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCityIdeaDrafts } from "./city-ideas";
import type { DayContext } from "./types";

vi.mock("./gemini-client", () => ({
  getGeminiModel: vi.fn()
}));

import { getGeminiModel } from "./gemini-client";

const mockedGetGeminiModel = vi.mocked(getGeminiModel);

const context: DayContext = {
  city: "Toronto",
  weather: "rain",
  temperatureF: 52,
  localHour: 19,
  timeOfDay: "evening",
  timeZone: "America/Toronto",
  availableHours: 3,
  budget: "low",
  energy: "medium",
  social: "flexible",
  preferenceTags: ["food", "low-planning"]
};

describe("generateCityIdeaDrafts", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalKey;
    mockedGetGeminiModel.mockReset();
  });

  it("returns local fallback drafts when Gemini is not configured", async () => {
    delete process.env.GEMINI_API_KEY;
    mockedGetGeminiModel.mockReturnValue(null);

    const drafts = await generateCityIdeaDrafts(context);

    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts[0]).toEqual(
      expect.objectContaining({
        title: expect.stringContaining("Toronto"),
        category: expect.any(String),
        weatherFit: expect.arrayContaining(["rain"]),
        tags: expect.arrayContaining(["evening"])
      })
    );
  });

  it("caches generated drafts for repeated matching contexts", async () => {
    const generateContent = vi.fn().mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            suggestions: [
              {
                title: "Generated idea",
                category: "culture",
                description: "A generated city-aware plan.",
                locationLabel: "A useful city anchor",
                cost: "low",
                distanceMiles: 1,
                durationHours: 1,
                energy: "low",
                social: "solo",
                weatherFit: ["rain"],
                tags: ["evening"],
                source: "city"
              }
            ]
          })
      }
    });
    mockedGetGeminiModel.mockReturnValue({ generateContent } as never);

    await generateCityIdeaDrafts({ ...context, city: "Cache City" });
    await generateCityIdeaDrafts({ ...context, city: "Cache City" });

    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
