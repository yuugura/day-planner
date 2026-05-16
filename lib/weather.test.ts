import { describe, expect, it } from "vitest";
import { describeWeatherCode } from "./weather";

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
