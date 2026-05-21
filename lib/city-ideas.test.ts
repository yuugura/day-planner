import { afterEach, describe, expect, it, vi } from "vitest";
import { cityIdeaDraftsToSuggestions, generateCityIdeaDrafts, generateCityIdeaResult } from "./city-ideas";
import type { DayContext } from "./types";

vi.mock("./gemini-client", () => ({
  generateGroundedContent: vi.fn()
}));

vi.mock("./db", () => ({
  getPool: vi.fn()
}));

import { generateGroundedContent } from "./gemini-client";
import { getPool } from "./db";
import { clearCache } from "./ttl-cache";

const mockedGenerateGroundedContent = vi.mocked(generateGroundedContent);
const mockedGetPool = vi.mocked(getPool);

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
    clearCache("city-ideas");
    process.env.GEMINI_API_KEY = originalKey;
    mockedGenerateGroundedContent.mockReset();
    mockedGetPool.mockReset();
  });

  it("returns local fallback drafts when Gemini is not configured", async () => {
    delete process.env.GEMINI_API_KEY;
    mockedGenerateGroundedContent.mockResolvedValue(null);

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

  it("reports fallback status when Gemini is not configured", async () => {
    delete process.env.GEMINI_API_KEY;
    mockedGenerateGroundedContent.mockResolvedValue(null);

    const result = await generateCityIdeaResult({ ...context, city: "Fallback City" });

    expect(result.status).toBe("fallback");
    expect(result.drafts.length).toBeGreaterThan(0);
  });

  it("caches generated drafts for repeated matching contexts", async () => {
    mockedGenerateGroundedContent.mockResolvedValue(
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
    );

    await generateCityIdeaDrafts({ ...context, city: "Cache City" });
    await generateCityIdeaDrafts({ ...context, city: "Cache City" });

    expect(mockedGenerateGroundedContent).toHaveBeenCalledTimes(1);
  });

  it("reports memory cache status for repeated matching contexts", async () => {
    mockedGenerateGroundedContent.mockResolvedValue(
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
    );

    const first = await generateCityIdeaResult({ ...context, city: "Status Cache City" });
    const second = await generateCityIdeaResult({ ...context, city: "Status Cache City" });

    expect(first.status).toBe("grounded");
    expect(second.status).toBe("memory-cache");
  });

  it("maps drafts into temporary suggestions for ranking", () => {
    const suggestions = cityIdeaDraftsToSuggestions(context, [
      {
        title: "Generated Event Pattern",
        category: "social",
        description: "A reusable generated plan.",
        locationLabel: "A community venue",
        cost: "low",
        distanceMiles: 2,
        durationHours: 1.5,
        energy: "medium",
        social: "group",
        weatherFit: ["rain"],
        tags: ["evening"],
        source: "event"
      }
    ]);

    expect(suggestions[0]).toEqual(
      expect.objectContaining({
        id: expect.stringContaining("city-idea-toronto-generated-event-pattern"),
        ownerUserId: null,
        source: "city",
        tags: ["city-idea", "evening"]
      })
    );
  });

  it("reuses persistent cached drafts when Postgres has a fresh cache row", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            drafts: [
              {
                title: "Cached idea",
                category: "food",
                description: "A cached city idea.",
                locationLabel: "Cached neighborhood",
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
          }
        ]
      });
    mockedGetPool.mockReturnValue({ query } as never);

    const result = await generateCityIdeaResult({ ...context, city: "Persistent Cache City" });

    expect(result.status).toBe("persistent-cache");
    expect(result.drafts[0].title).toBe("Cached idea");
    expect(mockedGenerateGroundedContent).not.toHaveBeenCalled();
  });
});
