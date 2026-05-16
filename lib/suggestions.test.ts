import { afterEach, describe, expect, it, vi } from "vitest";
import { demoSuggestions } from "./sample-data";
import { archiveSuggestion, readSuggestions, readSuggestionsWithSource } from "./suggestions";
import { getPool } from "./db";

vi.mock("./db", () => ({
  getPool: vi.fn()
}));

const mockedGetPool = vi.mocked(getPool);

describe("readSuggestionsWithSource", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockedGetPool.mockReset();
  });

  it("falls back to demo suggestions when no database pool is configured", async () => {
    mockedGetPool.mockReturnValue(null);

    const result = await readSuggestionsWithSource();

    expect(result).toEqual({
      suggestions: demoSuggestions,
      source: "fallback"
    });
  });

  it("falls back to demo suggestions when the database has no active rows", async () => {
    mockedGetPool.mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [] })
    } as never);

    const result = await readSuggestionsWithSource();

    expect(result.source).toBe("fallback");
    expect(result.suggestions).toBe(demoSuggestions);
  });

  it("falls back to demo suggestions when the database query fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedGetPool.mockReturnValue({
      query: vi.fn().mockRejectedValue(new Error("database unavailable"))
    } as never);

    const result = await readSuggestionsWithSource();

    expect(result.source).toBe("fallback");
    expect(result.suggestions).toBe(demoSuggestions);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Falling back to demo suggestions after database read failed.",
      expect.any(Error)
    );
  });

  it("maps Postgres suggestion rows into app suggestion objects", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "library-work",
          title: "Work from the library",
          category: "productive",
          description: "Do one focused work block from a quiet public library.",
          location_label: "Central library",
          cost: "free",
          distance_miles: "2.30",
          duration_hours: "1.50",
          energy: "medium",
          social: "solo",
          weather_fit: ["rain", "snow"],
          tags: ["focus", "indoors"],
          source: "productive",
          owner_user_id: "user-1"
        }
      ]
    });
    mockedGetPool.mockReturnValue({ query } as never);

    const result = await readSuggestionsWithSource();

    expect(result).toEqual({
      source: "postgres",
      suggestions: [
        {
          id: "library-work",
          ownerUserId: "user-1",
          title: "Work from the library",
          category: "productive",
          description: "Do one focused work block from a quiet public library.",
          locationLabel: "Central library",
          cost: "free",
          distanceMiles: 2.3,
          durationHours: 1.5,
          energy: "medium",
          social: "solo",
          weatherFit: ["rain", "snow"],
          tags: ["focus", "indoors"],
          source: "productive"
        }
      ]
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("from suggestions"), [null]);
  });
});

describe("readSuggestions", () => {
  afterEach(() => {
    mockedGetPool.mockReset();
  });

  it("returns only the suggestion list for existing recommendation callers", async () => {
    mockedGetPool.mockReturnValue(null);

    await expect(readSuggestions()).resolves.toBe(demoSuggestions);
  });
});

describe("archiveSuggestion", () => {
  afterEach(() => {
    mockedGetPool.mockReset();
  });

  it("soft deletes only an active suggestion owned by the current user", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1 });
    mockedGetPool.mockReturnValue({ query } as never);

    await expect(archiveSuggestion("custom-1", "user-1")).resolves.toBe(true);

    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("active = false"), ["custom-1", "user-1"]);
  });

  it("reports false when no owned active suggestion was archived", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 0 });
    mockedGetPool.mockReturnValue({ query } as never);

    await expect(archiveSuggestion("seeded-1", "user-1")).resolves.toBe(false);
  });
});
