import type {
  CostLevel,
  DayContext,
  EnergyLevel,
  FeedbackRecord,
  ScoredSuggestion,
  SocialSetting,
  Suggestion,
  TimeOfDay
} from "./types";

const costRank: Record<CostLevel, number> = { free: 0, low: 1, medium: 2, high: 3 };
const energyRank: Record<EnergyLevel, number> = { low: 0, medium: 1, high: 2 };

function logistic(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getTimeFit(suggestion: Suggestion, timeOfDay: TimeOfDay) {
  const tags = new Set(suggestion.tags.map((tag) => tag.toLowerCase()));
  const explicitTags: Record<TimeOfDay, string[]> = {
    morning: ["morning", "breakfast", "coffee", "early"],
    midday: ["midday", "lunch", "brunch"],
    afternoon: ["afternoon", "errand", "explore"],
    evening: ["evening", "dinner", "date-friendly", "drinks"],
    night: ["night", "late", "wind-down"]
  };

  if (explicitTags[timeOfDay].some((tag) => tags.has(tag))) return 1;

  if (timeOfDay === "morning") {
    return suggestion.category === "productive" || suggestion.category === "fitness" || tags.has("coffee") ? 0.75 : 0.45;
  }
  if (timeOfDay === "midday") {
    return suggestion.category === "food" || suggestion.category === "outdoors" || suggestion.durationHours <= 1.5 ? 0.75 : 0.5;
  }
  if (timeOfDay === "afternoon") {
    return suggestion.category === "culture" || suggestion.category === "outdoors" || suggestion.category === "creative" ? 0.75 : 0.55;
  }
  if (timeOfDay === "evening") {
    return suggestion.category === "food" || suggestion.category === "social" || suggestion.category === "rest" ? 0.75 : 0.45;
  }

  return suggestion.category === "rest" || suggestion.energy === "low" ? 0.75 : 0.35;
}

export function extractFeatures(suggestion: Suggestion, context: DayContext): Record<string, number> {
  const tagOverlap = suggestion.tags.filter((tag) => context.preferenceTags.includes(tag)).length;
  const socialMatch = suggestion.social === context.social || suggestion.social === "flexible" ? 1 : 0;
  const budgetFit = costRank[suggestion.cost] <= costRank[context.budget] ? 1 : 0;
  const energyGap = Math.abs(energyRank[suggestion.energy] - energyRank[context.energy]);
  const timeFit = getTimeFit(suggestion, context.timeOfDay);

  return {
    bias: 1,
    category_outdoors: suggestion.category === "outdoors" ? 1 : 0,
    category_culture: suggestion.category === "culture" ? 1 : 0,
    category_food: suggestion.category === "food" ? 1 : 0,
    category_fitness: suggestion.category === "fitness" ? 1 : 0,
    category_social: suggestion.category === "social" ? 1 : 0,
    category_productive: suggestion.category === "productive" ? 1 : 0,
    category_creative: suggestion.category === "creative" ? 1 : 0,
    category_rest: suggestion.category === "rest" ? 1 : 0,
    weather_match: suggestion.weatherFit.includes(context.weather) ? 1 : 0,
    cost_level: costRank[suggestion.cost] / 3,
    within_budget: budgetFit,
    distance: Math.min(suggestion.distanceMiles / 10, 1),
    duration_fit: suggestion.durationHours <= context.availableHours ? 1 : 0,
    time_fit: timeFit,
    local_hour: context.localHour / 23,
    energy_match: 1 - energyGap / 2,
    social_match: socialMatch,
    tag_overlap: Math.min(tagOverlap / 3, 1),
    source_event: suggestion.source === "event" ? 1 : 0,
    source_productive: suggestion.source === "productive" ? 1 : 0
  };
}

export function trainLogisticRegression(records: FeedbackRecord[]) {
  const weights: Record<string, number> = { bias: 0 };
  const learningRate = 0.18;
  const epochs = Math.min(120, 35 + records.length * 8);

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const record of records) {
      const prediction = predictWithWeights(record.features, weights);
      const error = (record.liked ? 1 : 0) - prediction;

      for (const [key, value] of Object.entries(record.features)) {
        weights[key] = (weights[key] ?? 0) + learningRate * error * value;
      }
    }
  }

  return weights;
}

export function predictWithWeights(features: Record<string, number>, weights: Record<string, number>) {
  const linear = Object.entries(features).reduce((sum, [key, value]) => sum + value * (weights[key] ?? 0), 0);
  return logistic(linear);
}

function scoreRules(suggestion: Suggestion, context: DayContext) {
  const reasons: string[] = [];
  let score = 0.35;

  if (suggestion.weatherFit.includes(context.weather)) {
    score += 0.18;
    reasons.push("fits the weather");
  }

  if (costRank[suggestion.cost] <= costRank[context.budget]) {
    score += 0.14;
    reasons.push("within budget");
  }

  if (suggestion.durationHours <= context.availableHours) {
    score += 0.1;
    reasons.push(context.availableHours >= 24 ? "works for an open day" : "fits your available time");
  }

  const timeFit = getTimeFit(suggestion, context.timeOfDay);
  if (timeFit >= 0.75) {
    score += 0.12;
    reasons.push(`fits the ${context.timeOfDay}`);
  } else if (timeFit < 0.4) {
    score -= 0.06;
  }

  const energyGap = Math.abs(energyRank[suggestion.energy] - energyRank[context.energy]);
  score += energyGap === 0 ? 0.13 : energyGap === 1 ? 0.06 : -0.05;
  if (energyGap === 0) reasons.push("matches your energy");

  const socialMatch = suggestion.social === context.social || suggestion.social === "flexible";
  if (socialMatch) {
    score += 0.11;
    reasons.push("matches your social mood");
  }

  const tagMatches = suggestion.tags.filter((tag) => context.preferenceTags.includes(tag));
  if (tagMatches.length > 0) {
    score += Math.min(0.18, tagMatches.length * 0.07);
    reasons.push(`matches ${tagMatches.slice(0, 2).join(" and ")}`);
  }

  score -= Math.min(0.16, suggestion.distanceMiles * 0.018);

  return { score: clamp01(score), reasons };
}

function explorationBonus(suggestion: Suggestion, index: number) {
  const sourceBonus = suggestion.source === "event" ? 0.025 : suggestion.source === "everyday" ? 0.015 : 0;
  return sourceBonus + (index % 3) * 0.006;
}

export function rankSuggestions(
  suggestions: Suggestion[],
  context: DayContext,
  feedback: FeedbackRecord[]
): ScoredSuggestion[] {
  const weights = trainLogisticRegression(feedback);
  const hasEnoughTrainingData = feedback.length >= 4;

  return suggestions
    .map((suggestion, index) => {
      const features = extractFeatures(suggestion, context);
      const ruleResult = scoreRules(suggestion, context);
      const modelProbability = hasEnoughTrainingData ? predictWithWeights(features, weights) : 0.5;
      const modelWeight = hasEnoughTrainingData ? 0.42 : 0.15;
      const score =
        ruleResult.score * (1 - modelWeight) + modelProbability * modelWeight + explorationBonus(suggestion, index);

      return {
        ...suggestion,
        score: clamp01(score),
        ruleScore: ruleResult.score,
        modelProbability,
        reasons: ruleResult.reasons.slice(0, 3)
      };
    })
    .sort((a, b) => b.score - a.score);
}
