import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlaceSuggestions, fetchPlaceSuggestionsSafe } from "./places";
import { clearCache } from "./ttl-cache";

describe("fetchPlaceSuggestions", () => {
  afterEach(() => {
    clearCache("places");
    vi.restoreAllMocks();
  });

  it("maps named OpenStreetMap elements into recommendation suggestions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 10,
              lat: 43.6465,
              lon: -79.4637,
              tags: {
                name: "High Park",
                leisure: "park"
              }
            },
            {
              type: "way",
              id: 20,
              center: {
                lat: 43.653,
                lon: -79.383
              },
              tags: {
                name: "Toronto Reference Library",
                amenity: "library",
                "addr:street": "Yonge Street",
                "addr:housenumber": "789"
              }
            },
            {
              type: "node",
              id: 30,
              lat: 43.65,
              lon: -79.38,
              tags: {
                leisure: "park"
              }
            }
          ]
        })
      })
    );

    const suggestions = await fetchPlaceSuggestions({
      city: "Toronto",
      latitude: 43.6532,
      longitude: -79.3832
    });

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toMatchObject({
      id: "osm-way-20",
      title: "Toronto Reference Library",
      category: "productive",
      cost: "free",
      source: "city",
      locationLabel: "Toronto Reference Library, 789 Yonge Street"
    });
    expect(suggestions[1]).toMatchObject({
      id: "osm-node-10",
      title: "High Park",
      category: "outdoors",
      tags: ["fresh-air", "explore", "low-planning"]
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://overpass-api.de/api/interpreter",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
          "User-Agent": "DayPlannerLocal/0.1 (local development)"
        })
      })
    );
  });

  it("deduplicates places by name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 1,
              lat: 43.653,
              lon: -79.383,
              tags: { name: "Market Hall", amenity: "marketplace" }
            },
            {
              type: "way",
              id: 2,
              center: { lat: 43.654, lon: -79.384 },
              tags: { name: "Market Hall", amenity: "marketplace" }
            }
          ]
        })
      })
    );

    const suggestions = await fetchPlaceSuggestions({
      city: "Toronto",
      latitude: 43.6532,
      longitude: -79.3832
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].title).toBe("Market Hall");
  });

  it("deduplicates formatted variants of the same place name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 1,
              lat: 43.653,
              lon: -79.383,
              tags: { name: "Bean House Cafe", amenity: "cafe" }
            },
            {
              type: "way",
              id: 2,
              center: { lat: 43.654, lon: -79.384 },
              tags: { name: "Bean House - Queen Street", amenity: "cafe" }
            }
          ]
        })
      })
    );

    const suggestions = await fetchPlaceSuggestions({
      city: "Toronto",
      latitude: 43.6532,
      longitude: -79.3832
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].title).toBe("Bean House Cafe");
  });

  it("diversifies nearby places across categories before applying the limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 1,
              lat: 43.653,
              lon: -79.383,
              tags: { name: "Near Cafe 1", amenity: "cafe" }
            },
            {
              type: "node",
              id: 2,
              lat: 43.6531,
              lon: -79.3831,
              tags: { name: "Near Cafe 2", amenity: "cafe" }
            },
            {
              type: "node",
              id: 3,
              lat: 43.6532,
              lon: -79.3832,
              tags: { name: "Near Cafe 3", amenity: "cafe" }
            },
            {
              type: "node",
              id: 4,
              lat: 43.66,
              lon: -79.39,
              tags: { name: "City Museum", tourism: "museum" }
            },
            {
              type: "node",
              id: 5,
              lat: 43.67,
              lon: -79.4,
              tags: { name: "Riverside Park", leisure: "park" }
            }
          ]
        })
      })
    );

    const suggestions = await fetchPlaceSuggestions(
      {
        city: "Toronto",
        latitude: 43.6532,
        longitude: -79.3832
      },
      3
    );

    expect(suggestions.map((suggestion) => suggestion.category)).toEqual(["food", "culture", "outdoors"]);
  });
});

describe("fetchPlaceSuggestionsSafe", () => {
  afterEach(() => {
    clearCache("places");
    vi.restoreAllMocks();
  });

  it("returns an empty list when Overpass fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(
      fetchPlaceSuggestionsSafe({
        city: "Toronto",
        latitude: 43.6532,
        longitude: -79.3832
      })
    ).resolves.toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith("Skipping OpenStreetMap places after lookup failed.", expect.any(Error));
  });
});
