export type WeatherCondition = "clear" | "cloudy" | "rain" | "snow" | "hot" | "cold";

export type SuggestionCategory =
  | "outdoors"
  | "culture"
  | "food"
  | "fitness"
  | "social"
  | "productive"
  | "creative"
  | "rest";

export type CostLevel = "free" | "low" | "medium" | "high";
export type EnergyLevel = "low" | "medium" | "high";
export type SocialSetting = "solo" | "pair" | "group" | "flexible";

export type DayContext = {
  city: string;
  weather: WeatherCondition;
  temperatureF: number;
  availableHours: number;
  budget: CostLevel;
  energy: EnergyLevel;
  social: SocialSetting;
  preferenceTags: string[];
};

export type PlaceLookup = {
  city: string;
  latitude: number;
  longitude: number;
};

export type WeatherReport = {
  city: string;
  displayName: string;
  condition: WeatherCondition;
  description: string;
  temperatureF: number;
  windMph: number;
  weatherCode: number;
  observedAt: string;
};

export type CitySearchResult = {
  id: string;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  displayName: string;
};

export type Suggestion = {
  id: string;
  ownerUserId?: string | null;
  title: string;
  category: SuggestionCategory;
  description: string;
  locationLabel: string;
  cost: CostLevel;
  distanceMiles: number;
  durationHours: number;
  energy: EnergyLevel;
  social: SocialSetting;
  weatherFit: WeatherCondition[];
  tags: string[];
  source: "event" | "city" | "everyday" | "productive";
  externalUrl?: string;
};

export type ScoredSuggestion = Suggestion & {
  score: number;
  ruleScore: number;
  modelProbability: number;
  reasons: string[];
};

export type FeedbackRecord = {
  userId: string;
  suggestionId: string;
  liked: boolean;
  features: Record<string, number>;
};
