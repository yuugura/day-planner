import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEventSuggestions, fetchEventSuggestionsSafe } from "./events";
import { clearCache } from "./ttl-cache";

describe("fetchEventSuggestions", () => {
  const originalApiKey = process.env.TICKETMASTER_API_KEY;

  afterEach(() => {
    clearCache("events");
    process.env.TICKETMASTER_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it("returns no suggestions when the API key is missing", async () => {
    process.env.TICKETMASTER_API_KEY = "";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const suggestions = await fetchEventSuggestions({
      city: "Toronto",
      latitude: 43.6532,
      longitude: -79.3832
    });

    expect(suggestions).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps Ticketmaster events into recommendation suggestions", async () => {
    process.env.TICKETMASTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          _embedded: {
            events: [
              {
                id: "abc123",
                name: "City Comedy Night",
                url: "https://example.com/event",
                dates: {
                  start: {
                    localDate: "2026-05-20",
                    localTime: "20:00:00"
                  }
                },
                priceRanges: [{ min: 22 }],
                classifications: [
                  {
                    segment: { name: "Arts & Theatre" },
                    genre: { name: "Comedy" }
                  }
                ],
                _embedded: {
                  venues: [
                    {
                      name: "Downtown Theatre",
                      distance: 3.2,
                      units: "miles",
                      city: { name: "Toronto" }
                    }
                  ]
                }
              }
            ]
          }
        })
      })
    );

    const suggestions = await fetchEventSuggestions({
      city: "Toronto, Ontario, Canada",
      latitude: 43.6532,
      longitude: -79.3832
    });

    expect(suggestions).toEqual([
      expect.objectContaining({
        id: "ticketmaster-abc123",
        title: "City Comedy Night",
        category: "social",
        cost: "low",
        distanceMiles: 3.2,
        source: "event",
        externalUrl: "https://example.com/event",
        tags: expect.arrayContaining(["connection", "indoors", "event", "comedy"])
      })
    ]);
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining("apikey=test-key")
      }),
      expect.objectContaining({
        headers: { Accept: "application/json" }
      })
    );
  });
});

describe("fetchEventSuggestionsSafe", () => {
  const originalApiKey = process.env.TICKETMASTER_API_KEY;

  afterEach(() => {
    clearCache("events");
    process.env.TICKETMASTER_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it("returns an empty list when Ticketmaster fails", async () => {
    process.env.TICKETMASTER_API_KEY = "test-key";
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" }));

    await expect(
      fetchEventSuggestionsSafe({
        city: "Toronto",
        latitude: 43.6532,
        longitude: -79.3832
      })
    ).resolves.toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith("Skipping Ticketmaster events after lookup failed.", expect.any(Error));
  });
});
