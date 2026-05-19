import { describe, expect, it } from "vitest";
import { extractFeatures, predictWithWeights, rankSuggestions, trainLogisticRegression } from "./recommender";
import type { DayContext, FeedbackRecord, Suggestion } from "./types";

const context: DayContext = {
  city: "Toronto",
  weather: "rain",
  temperatureF: 52,
  localHour: 12,
  timeOfDay: "midday",
  timeZone: "America/Toronto",
  availableHours: 2,
  budget: "low",
  energy: "medium",
  social: "pair",
  preferenceTags: ["indoors", "food", "low-planning"]
};

const indoorSuggestion: Suggestion = {
  id: "indoor-food",
  title: "Try a cozy cafe",
  category: "food",
  description: "A low-key indoor food stop.",
  locationLabel: "Nearby cafe",
  cost: "low",
  distanceMiles: 1.5,
  durationHours: 1,
  energy: "medium",
  social: "pair",
  weatherFit: ["rain", "cloudy", "cold"],
  tags: ["indoors", "food"],
  source: "city"
};

const outdoorSuggestion: Suggestion = {
  id: "outdoor-run",
  title: "Go for a long run",
  category: "fitness",
  description: "A higher-energy outdoor workout.",
  locationLabel: "Trail",
  cost: "free",
  distanceMiles: 7,
  durationHours: 3,
  energy: "high",
  social: "solo",
  weatherFit: ["clear", "cloudy"],
  tags: ["movement", "fresh-air"],
  source: "event"
};

describe("extractFeatures", () => {
  it("converts suggestion and day context into normalized model features", () => {
    const features = extractFeatures(indoorSuggestion, context);

    expect(features).toMatchObject({
      bias: 1,
      category_food: 1,
      category_fitness: 0,
      weather_match: 1,
      cost_level: 1 / 3,
      within_budget: 1,
      distance: 0.15,
      duration_fit: 1,
      time_fit: 0.75,
      local_hour: 12 / 23,
      energy_match: 1,
      social_match: 1,
      tag_overlap: 2 / 3,
      source_event: 0,
      source_productive: 0
    });
  });

  it("captures mismatches for weather, duration, energy, social setting, and tags", () => {
    const features = extractFeatures(outdoorSuggestion, context);

    expect(features.weather_match).toBe(0);
    expect(features.duration_fit).toBe(0);
    expect(features.time_fit).toBe(0.5);
    expect(features.energy_match).toBe(0.5);
    expect(features.social_match).toBe(0);
    expect(features.tag_overlap).toBe(0);
    expect(features.source_event).toBe(1);
  });
});

describe("predictWithWeights", () => {
  it("returns a neutral probability for zero weights", () => {
    expect(predictWithWeights({ bias: 1, weather_match: 1 }, { bias: 0, weather_match: 0 })).toBe(0.5);
  });

  it("moves above or below neutral based on weighted features", () => {
    expect(predictWithWeights({ bias: 1, weather_match: 1 }, { bias: 0, weather_match: 2 })).toBeGreaterThan(0.5);
    expect(predictWithWeights({ bias: 1, weather_match: 1 }, { bias: 0, weather_match: -2 })).toBeLessThan(0.5);
  });
});

describe("trainLogisticRegression", () => {
  it("learns positive weights from liked records and negative weights from disliked records", () => {
    const records: FeedbackRecord[] = [
      { userId: "user-a", suggestionId: "liked-1", liked: true, features: { bias: 1, tag_overlap: 1 } },
      { userId: "user-a", suggestionId: "liked-2", liked: true, features: { bias: 1, tag_overlap: 1 } },
      { userId: "user-a", suggestionId: "disliked-1", liked: false, features: { bias: 1, distance: 1 } },
      { userId: "user-a", suggestionId: "disliked-2", liked: false, features: { bias: 1, distance: 1 } }
    ];

    const weights = trainLogisticRegression(records);

    expect(weights.tag_overlap).toBeGreaterThan(0);
    expect(weights.distance).toBeLessThan(0);
  });
});

describe("rankSuggestions", () => {
  it("uses cold-start rules to favor suggestions that match the current day", () => {
    const ranked = rankSuggestions([outdoorSuggestion, indoorSuggestion], context, []);

    expect(ranked[0].id).toBe("indoor-food");
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked[0].reasons).toContain("fits the weather");
    expect(ranked.every((suggestion) => suggestion.score >= 0 && suggestion.score <= 1)).toBe(true);
  });

  it("uses local time to separate lunch and evening ideas", () => {
    const lunchSuggestion: Suggestion = { ...indoorSuggestion, id: "lunch", title: "Lunch stop", tags: ["food", "lunch"] };
    const eveningSuggestion: Suggestion = {
      ...indoorSuggestion,
      id: "evening",
      title: "Evening drink",
      category: "social",
      tags: ["connection", "evening"]
    };

    const middayRanked = rankSuggestions([eveningSuggestion, lunchSuggestion], { ...context, timeOfDay: "midday", localHour: 12 }, []);
    const eveningRanked = rankSuggestions([lunchSuggestion, eveningSuggestion], { ...context, timeOfDay: "evening", localHour: 19 }, []);

    expect(middayRanked[0].id).toBe("lunch");
    expect(eveningRanked[0].id).toBe("evening");
  });

  it("treats all-day availability as an open planning window", () => {
    const longOuting: Suggestion = {
      ...indoorSuggestion,
      id: "long-outing",
      title: "Spend the day out",
      distanceMiles: 0.5,
      durationHours: 8,
      tags: ["indoors", "food", "lunch"]
    };

    const ranked = rankSuggestions([outdoorSuggestion, longOuting], { ...context, availableHours: 24 }, []);

    expect(ranked[0].id).toBe("long-outing");
    expect(ranked[0].reasons).toContain("works for an open day");
  });

  it("uses learned feedback after enough examples are available", () => {
    const indoorFeatures = extractFeatures(indoorSuggestion, context);
    const outdoorFeatures = extractFeatures(outdoorSuggestion, context);
    const feedback: FeedbackRecord[] = [
      { userId: "user-a", suggestionId: "outdoor-1", liked: true, features: outdoorFeatures },
      { userId: "user-a", suggestionId: "outdoor-2", liked: true, features: outdoorFeatures },
      { userId: "user-a", suggestionId: "outdoor-3", liked: true, features: outdoorFeatures },
      { userId: "user-a", suggestionId: "indoor-1", liked: false, features: indoorFeatures }
    ];

    const ranked = rankSuggestions([indoorSuggestion, outdoorSuggestion], context, feedback);
    const outdoor = ranked.find((suggestion) => suggestion.id === "outdoor-run");
    const indoor = ranked.find((suggestion) => suggestion.id === "indoor-food");

    expect(outdoor?.modelProbability).toBeGreaterThan(indoor?.modelProbability ?? 1);
  });

  it("returns suggestions sorted by descending score with scoring details", () => {
    const ranked = rankSuggestions([outdoorSuggestion, indoorSuggestion], context, []);

    expect(ranked).toHaveLength(2);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked[0]).toEqual(
      expect.objectContaining({
        ruleScore: expect.any(Number),
        modelProbability: expect.any(Number),
        reasons: expect.any(Array)
      })
    );
  });
});
