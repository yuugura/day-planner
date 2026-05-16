"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bike,
  BriefcaseBusiness,
  CalendarDays,
  CloudSun,
  Coffee,
  DollarSign,
  Clock3,
  MapPin,
  Send,
  Sparkles,
  Thermometer,
  ThumbsDown,
  ThumbsUp,
  Wind,
  Users
} from "lucide-react";
import type {
  CitySearchResult,
  CostLevel,
  DayContext,
  EnergyLevel,
  ScoredSuggestion,
  SocialSetting,
  WeatherReport
} from "@/lib/types";

type PlannerResponse = {
  context: DayContext;
  summary: string;
  suggestions: ScoredSuggestion[];
  trainingExamples: number;
};

type TemperatureUnit = "fahrenheit" | "celsius";

const tagOptions = ["fresh-air", "food", "focus", "art", "movement", "connection", "creative", "low-planning"];
const userStorageKey = "day-planner-user-id";
const temperatureUnitStorageKey = "day-planner-temperature-unit";

const initialContext: DayContext = {
  city: "Toronto",
  weather: "cloudy",
  temperatureF: 55,
  availableHours: 3,
  budget: "low",
  energy: "medium",
  social: "flexible",
  preferenceTags: ["fresh-air", "food", "low-planning"]
};

export default function Home() {
  const [context, setContext] = useState<DayContext>(initialContext);
  const [data, setData] = useState<PlannerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastPlannedAt, setLastPlannedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<string, boolean>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [weatherReport, setWeatherReport] = useState<WeatherReport | null>(null);
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>("fahrenheit");
  const [citySuggestions, setCitySuggestions] = useState<CitySearchResult[]>([]);
  const [selectedCity, setSelectedCity] = useState<CitySearchResult | null>(null);
  const [citySearchLoading, setCitySearchLoading] = useState(false);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);

  const topSuggestion = data?.suggestions[0];
  const hasSelectedCity = selectedCity !== null && selectedCity.name === context.city;
  const displayedTemperature = formatTemperature(
    weatherReport ? weatherReport.temperatureF : context.temperatureF,
    temperatureUnit
  );

  async function loadRecommendations(nextContext = context, nextUserId = userId, nextSelectedCity = selectedCity) {
    if (!nextSelectedCity || nextSelectedCity.name !== nextContext.city) {
      setError("Choose a city from the suggestions before planning.");
      setShowCitySuggestions(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const weatherUrl = buildWeatherUrl(nextContext.city, nextSelectedCity);
      const weatherResponse = await fetch(weatherUrl);
      if (!weatherResponse.ok) {
        const payload = (await weatherResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Weather request failed.");
      }

      const weatherPayload = (await weatherResponse.json()) as { weather: WeatherReport };
      const weatherContext: DayContext = {
        ...nextContext,
        city: weatherPayload.weather.city,
        weather: weatherPayload.weather.condition,
        temperatureF: weatherPayload.weather.temperatureF
      };
      setWeatherReport(weatherPayload.weather);

      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...weatherContext, userId: nextUserId })
      });

      if (!response.ok) {
        throw new Error(`Recommendation request failed with ${response.status}`);
      }

      const payload = (await response.json()) as PlannerResponse;
      setData(payload);
      setContext(payload.context);
      setLastPlannedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }));
    } catch (requestError) {
      console.error(requestError);
      setError(requestError instanceof Error ? requestError.message : "Could not refresh recommendations.");
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback(suggestion: ScoredSuggestion, liked: boolean) {
    setFeedbackState((current) => ({ ...current, [suggestion.id]: liked }));
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, suggestionId: suggestion.id, liked, context })
    });
    await loadRecommendations();
  }

  useEffect(() => {
    async function initializePlanner() {
      const existingUserId = window.localStorage.getItem(userStorageKey);
      const nextUserId = existingUserId || window.crypto.randomUUID();
      const savedTemperatureUnit = window.localStorage.getItem(temperatureUnitStorageKey);
      window.localStorage.setItem(userStorageKey, nextUserId);
      setUserId(nextUserId);
      if (savedTemperatureUnit === "fahrenheit" || savedTemperatureUnit === "celsius") {
        setTemperatureUnit(savedTemperatureUnit);
      }

      try {
        const response = await fetch(`/api/cities?query=${encodeURIComponent(initialContext.city)}`);
        if (!response.ok) throw new Error("Could not initialize the default city.");

        const payload = (await response.json()) as { cities: CitySearchResult[] };
        const defaultCity = payload.cities[0];
        if (!defaultCity) throw new Error("Could not find the default city.");

        setSelectedCity(defaultCity);
        setContext({ ...initialContext, city: defaultCity.name });
        void loadRecommendations({ ...initialContext, city: defaultCity.name }, nextUserId, defaultCity);
      } catch (initializationError) {
        console.error(initializationError);
        setError("Choose a city from the suggestions before planning.");
      }
    }

    void initializePlanner();
  }, []);

  useEffect(() => {
    const query = context.city.trim();
    if (query.length < 2) {
      setCitySuggestions([]);
      setCitySearchLoading(false);
      return;
    }

    if (selectedCity && selectedCity.name === query) {
      setCitySuggestions([]);
      setCitySearchLoading(false);
      return;
    }

    const abortController = new AbortController();
    setCitySearchLoading(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/cities?query=${encodeURIComponent(query)}`, {
          signal: abortController.signal
        });
        if (!response.ok) throw new Error("City search failed.");

        const payload = (await response.json()) as { cities: CitySearchResult[] };
        setCitySuggestions(payload.cities);
        setShowCitySuggestions(true);
      } catch (searchError) {
        if (!abortController.signal.aborted) {
          console.error(searchError);
          setCitySuggestions([]);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setCitySearchLoading(false);
        }
      }
    }, 250);

    return () => {
      abortController.abort();
      window.clearTimeout(timeoutId);
    };
  }, [context.city, selectedCity]);

  const categoryMix = useMemo(() => {
    const counts = new Map<string, number>();
    data?.suggestions.slice(0, 5).forEach((item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1));
    return [...counts.entries()];
  }, [data]);

  return (
    <main className="shell">
      <section className="controlPane" aria-label="Planner controls">
        <div className="brandRow">
          <div className="brandMark">
            <Sparkles size={20} />
          </div>
          <div>
            <h1>Day Planner</h1>
            <p>Pick a day that fits the real you.</p>
          </div>
        </div>

        <div className="field cityField">
          <span>
            <MapPin size={16} /> City
          </span>
          <input
            value={context.city}
            onBlur={() => window.setTimeout(() => setShowCitySuggestions(false), 120)}
            onChange={(event) => {
              setSelectedCity(null);
              setContext({ ...context, city: event.target.value });
              setShowCitySuggestions(true);
            }}
            onFocus={() => setShowCitySuggestions(true)}
            placeholder="Toronto"
          />
          <div className={hasSelectedCity ? "cityHint confirmed" : "cityHint"}>
            {hasSelectedCity
              ? `Selected: ${selectedCity.displayName}`
              : context.city.trim().length > 0
                ? "Choose a city from the suggestions."
                : "Start typing a city."}
          </div>
          {showCitySuggestions && (citySuggestions.length > 0 || citySearchLoading) ? (
            <div className="citySuggestions" role="listbox">
              {citySearchLoading ? <div className="citySuggestionStatus">Searching cities...</div> : null}
              {citySuggestions.map((city) => (
                <button
                  key={city.id}
                  type="button"
                  role="option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSelectedCity(city);
                    setContext({ ...context, city: city.name });
                    setCitySuggestions([]);
                    setShowCitySuggestions(false);
                    setError(null);
                  }}
                >
                  <strong>{city.name}</strong>
                  <span>{city.displayName}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="weatherPanel">
          <div className="weatherPanelTop">
            <span>
              <CloudSun size={16} /> Weather
            </span>
            <div className="unitToggle" aria-label="Temperature unit">
              <button
                className={temperatureUnit === "fahrenheit" ? "active" : ""}
                type="button"
                onClick={() => updateTemperatureUnit("fahrenheit", setTemperatureUnit)}
              >
                F
              </button>
              <button
                className={temperatureUnit === "celsius" ? "active" : ""}
                type="button"
                onClick={() => updateTemperatureUnit("celsius", setTemperatureUnit)}
              >
                C
              </button>
            </div>
            <strong>{weatherReport ? weatherReport.description : context.weather}</strong>
          </div>
          <div className="weatherStats">
            <span>
              <Thermometer size={15} /> {displayedTemperature}
            </span>
            <span>
              <Wind size={15} /> {weatherReport ? `${weatherReport.windMph} mph` : "Not fetched"}
            </span>
            <span>
              <MapPin size={15} /> {weatherReport?.displayName || context.city}
            </span>
          </div>
        </div>

        <SelectField
          icon={<DollarSign size={16} />}
          label="Budget"
          value={context.budget}
          options={["free", "low", "medium", "high"]}
          onChange={(budget) => setContext({ ...context, budget: budget as CostLevel })}
        />

        <div className="grid2">
          <SelectField
            icon={<Bike size={16} />}
            label="Energy"
            value={context.energy}
            options={["low", "medium", "high"]}
            onChange={(energy) => setContext({ ...context, energy: energy as EnergyLevel })}
          />
          <SelectField
            icon={<Users size={16} />}
            label="Social"
            value={context.social}
            options={["solo", "pair", "group", "flexible"]}
            onChange={(social) => setContext({ ...context, social: social as SocialSetting })}
          />
        </div>

        <label className="field">
          <span>
            <CalendarDays size={16} /> Available hours
          </span>
          <input
            type="number"
            min="0.5"
            max="12"
            step="0.5"
            value={context.availableHours}
            onChange={(event) => setContext({ ...context, availableHours: Number(event.target.value) })}
          />
        </label>

        <div className="tags" aria-label="Preference tags">
          {tagOptions.map((tag) => {
            const selected = context.preferenceTags.includes(tag);
            return (
              <button
                className={selected ? "tag selected" : "tag"}
                key={tag}
                type="button"
                onClick={() =>
                  setContext({
                    ...context,
                    preferenceTags: selected
                      ? context.preferenceTags.filter((item) => item !== tag)
                      : [...context.preferenceTags, tag]
                  })
                }
              >
                {tag}
              </button>
            );
          })}
        </div>

        <button className="primaryButton" type="button" onClick={() => loadRecommendations()} disabled={loading || !hasSelectedCity}>
          <Send size={17} />
          {loading ? "Planning..." : "Plan my day"}
        </button>
        <div className="statusLine" role="status">
          <Clock3 size={15} />
          {error || (lastPlannedAt ? `Last planned at ${lastPlannedAt}` : "Ready to plan")}
        </div>
      </section>

      <section className="resultsPane" aria-live="polite">
        <div className="todayBar">
          <div>
            <span className="eyebrow">Today in {context.city || "your city"}</span>
            <h2>{topSuggestion ? topSuggestion.title : "Finding a good fit"}</h2>
          </div>
          <div className="scoreBadge">{topSuggestion ? `${Math.round(topSuggestion.score * 100)}%` : "--"}</div>
        </div>

        <div className="summaryStrip">
          <Coffee size={18} />
          <p>{data?.summary || "Recommendations will adapt as you tune the day and give feedback."}</p>
        </div>

        <div className="insightGrid">
          <Metric icon={<BriefcaseBusiness size={18} />} label="Training examples" value={String(data?.trainingExamples ?? 0)} />
          <Metric icon={<CloudSun size={18} />} label="Weather" value={context.weather} />
          <Metric icon={<CalendarDays size={18} />} label="Top categories" value={categoryMix.map(([name]) => name).join(", ") || "mixed"} />
        </div>

        <div className="suggestionList">
          {data?.suggestions.map((suggestion) => (
            <article className="suggestionCard" key={suggestion.id}>
              <div className="cardTop">
                <div>
                  <span className="source">{suggestion.source}</span>
                  <h3>{suggestion.title}</h3>
                </div>
                <span className="pill">{Math.round(suggestion.score * 100)}%</span>
              </div>
              <p>{suggestion.description}</p>
              <div className="metaRow">
                <span>{suggestion.category}</span>
                <span>{suggestion.cost}</span>
                <span>{suggestion.distanceMiles.toFixed(1)} mi</span>
                <span>{suggestion.durationHours}h</span>
              </div>
              <div className="reasonRow">
                {suggestion.reasons.map((reason) => (
                  <span key={reason}>{reason}</span>
                ))}
              </div>
              <div className="feedbackRow">
                <button
                  aria-label={`Like ${suggestion.title}`}
                  className={feedbackState[suggestion.id] === true ? "iconButton active" : "iconButton"}
                  type="button"
                  onClick={() => submitFeedback(suggestion, true)}
                >
                  <ThumbsUp size={17} />
                </button>
                <button
                  aria-label={`Dislike ${suggestion.title}`}
                  className={feedbackState[suggestion.id] === false ? "iconButton active" : "iconButton"}
                  type="button"
                  onClick={() => submitFeedback(suggestion, false)}
                >
                  <ThumbsDown size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function SelectField({
  icon,
  label,
  value,
  options,
  onChange
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>
        {icon} {label}
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatTemperature(temperatureF: number, unit: TemperatureUnit) {
  if (unit === "fahrenheit") return `${Math.round(temperatureF)} F`;
  return `${Math.round(((temperatureF - 32) * 5) / 9)} C`;
}

function updateTemperatureUnit(unit: TemperatureUnit, setTemperatureUnit: (unit: TemperatureUnit) => void) {
  setTemperatureUnit(unit);
  window.localStorage.setItem(temperatureUnitStorageKey, unit);
}

function buildWeatherUrl(city: string, selectedCity: CitySearchResult | null) {
  const url = new URL("/api/weather", window.location.origin);
  url.searchParams.set("city", city);

  if (selectedCity && selectedCity.name === city) {
    url.searchParams.set("latitude", String(selectedCity.latitude));
    url.searchParams.set("longitude", String(selectedCity.longitude));
    if (selectedCity.admin1) url.searchParams.set("admin1", selectedCity.admin1);
    if (selectedCity.country) url.searchParams.set("country", selectedCity.country);
  }

  return url.toString();
}
