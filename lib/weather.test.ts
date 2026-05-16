import { afterEach, describe, expect, it, vi } from "vitest";
import { describeWeatherCode, searchCities } from "./weather";

describe("describeWeatherCode", () => {
  it("maps clear, cloudy, rain, and snow weather codes", () => {
    expect(describeWeatherCode(0, 70)).toEqual({ condition: "clear", description: "Clear" });
    expect(describeWeatherCode(3, 70)).toEqual({ condition: "cloudy", description: "Cloudy" });
    expect(describeWeatherCode(61, 70)).toEqual({ condition: "rain", description: "Rainy" });
    expect(describeWeatherCode(71, 32)).toEqual({ condition: "snow", description: "Snowy" });
  });

  it("lets temperature override the code for hot and cold recommender buckets", () => {
    expect(describeWeatherCode(0, 90)).toEqual({ condition: "hot", description: "Hot" });
    expect(describeWeatherCode(0, 22)).toEqual({ condition: "cold", description: "Cold" });
  });
});

describe("searchCities", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not call the geocoding API for very short queries", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchCities("t")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps geocoding results into city suggestions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 6167865,
              name: "Toronto",
              admin1: "Ontario",
              country: "Canada",
              latitude: 43.70011,
              longitude: -79.4163
            }
          ]
        })
      })
    );

    await expect(searchCities("Toronto")).resolves.toEqual([
      {
        id: "6167865",
        name: "Toronto",
        admin1: "Ontario",
        country: "Canada",
        latitude: 43.70011,
        longitude: -79.4163,
        displayName: "Toronto, Ontario, Canada"
      }
    ]);
  });
});
