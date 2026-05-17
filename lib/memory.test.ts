import { describe, expect, it } from "vitest";
import { buildFeedbackMemory } from "./memory";
import type { FeedbackRecord, Suggestion } from "./types";

const walkSuggestion: Suggestion = {
  id: "park-walk",
  title: "Take a park walk",
  category: "outdoors",
  description: "Walk through a nearby park.",
  locationLabel: "Park",
  cost: "free",
  distanceMiles: 1,
  durationHours: 1,
  energy: "medium",
  social: "flexible",
  weatherFit: ["clear", "cloudy"],
  tags: ["fresh-air", "low-planning"],
  source: "city"
};

const classSuggestion: Suggestion = {
  id: "yoga-class",
  title: "Join a yoga class",
  category: "fitness",
  description: "Drop into a group class.",
  locationLabel: "Studio",
  cost: "medium",
  distanceMiles: 4,
  durationHours: 1,
  energy: "high",
  social: "group",
  weatherFit: ["rain", "snow"],
  tags: ["movement", "social"],
  source: "event"
};

describe("buildFeedbackMemory", () => {
  it("returns a cold-start message when the user has no feedback", () => {
    const memory = buildFeedbackMemory([]);

    expect(memory.feedbackCount).toBe(0);
    expect(memory.modelReady).toBe(false);
    expect(memory.insights[0]).toContain("Like or dislike");
  });

  it("summarizes recent likes, dislikes, and learned preference patterns", () => {
    const feedback: FeedbackRecord[] = [
      {
        userId: "user-1",
        suggestionId: "park-walk",
        liked: true,
        features: { bias: 1 },
        suggestion: walkSuggestion,
        createdAt: "2026-05-17T08:00:00.000Z"
      },
      {
        userId: "user-1",
        suggestionId: "second-walk",
        liked: true,
        features: { bias: 1 },
        suggestion: { ...walkSuggestion, id: "second-walk", title: "Walk by the water" }
      },
      {
        userId: "user-1",
        suggestionId: "yoga-class",
        liked: false,
        features: { bias: 1 },
        suggestion: classSuggestion
      },
      {
        userId: "user-1",
        suggestionId: "second-class",
        liked: false,
        features: { bias: 1 },
        suggestion: { ...classSuggestion, id: "second-class", title: "Try a spin class" }
      }
    ];

    const memory = buildFeedbackMemory(feedback);

    expect(memory).toMatchObject({
      feedbackCount: 4,
      likesCount: 2,
      dislikesCount: 2,
      modelReady: true
    });
    expect(memory.insights).toContain("So far, you seem to like outdoor ideas.");
    expect(memory.insights).toContain("You seem less drawn to fitness ideas.");
    expect(memory.insights).toContain("You often respond well to fresh-air plans.");
    expect(memory.insights).toContain("Movement-based plans may be a weaker fit for you.");
    expect(memory.insights.join(" ")).not.toContain("tagged");
    expect(memory.recent[0]).toMatchObject({
      title: "Take a park walk",
      liked: true,
      category: "outdoors"
    });
  });

  it("hydrates old feedback records from current suggestions when no snapshot exists", () => {
    const memory = buildFeedbackMemory(
      [{ userId: "user-1", suggestionId: "park-walk", liked: true, features: { bias: 1 } }],
      [walkSuggestion]
    );

    expect(memory.recent[0].title).toBe("Take a park walk");
    expect(memory.insights).toContain("So far, you seem to like outdoor ideas.");
  });
});
