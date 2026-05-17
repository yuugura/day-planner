"use client";

import { useEffect, useState } from "react";
import {
  Bike,
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  CloudSun,
  Coffee,
  DollarSign,
  Clock3,
  Edit3,
  MapPin,
  Plus,
  Save,
  Send,
  Sparkles,
  Thermometer,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Wind,
  X,
  Users
} from "lucide-react";
import type {
  CitySearchResult,
  CostLevel,
  DayContext,
  EnergyLevel,
  ScoredSuggestion,
  SocialSetting,
  Suggestion,
  SuggestionCategory,
  WeatherReport
} from "@/lib/types";

type PlannerResponse = {
  context: DayContext;
  summary: string;
  suggestions: ScoredSuggestion[];
  livePlaces: Suggestion[];
  liveEvents: Suggestion[];
  trainingExamples: number;
  livePlaceCount: number;
  liveEventCount: number;
};

type TemperatureUnit = "fahrenheit" | "celsius";
type ResultsTab = "recommendations" | "events";
type SuggestionForm = {
  title: string;
  category: SuggestionCategory;
  description: string;
  locationLabel: string;
  cost: CostLevel;
  distanceMiles: string;
  durationHours: string;
  energy: EnergyLevel;
  social: SocialSetting;
  weatherFit: string[];
  tags: string;
  source: Suggestion["source"];
};

const tagOptions = ["fresh-air", "food", "focus", "art", "movement", "connection", "creative", "low-planning"];
const categoryOptions: SuggestionCategory[] = ["outdoors", "culture", "food", "fitness", "social", "productive", "creative", "rest"];
const weatherOptions = ["clear", "cloudy", "rain", "snow", "hot", "cold"];
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

const emptySuggestionForm: SuggestionForm = {
  title: "",
  category: "social",
  description: "",
  locationLabel: "",
  cost: "low",
  distanceMiles: "1",
  durationHours: "1",
  energy: "medium",
  social: "flexible",
  weatherFit: ["clear", "cloudy"],
  tags: "low-planning",
  source: "everyday"
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
  const [suggestionCatalog, setSuggestionCatalog] = useState<Suggestion[]>([]);
  const [suggestionForm, setSuggestionForm] = useState<SuggestionForm>(emptySuggestionForm);
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [savingSuggestion, setSavingSuggestion] = useState(false);
  const [deletingSuggestionId, setDeletingSuggestionId] = useState<string | null>(null);
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null);
  const [activeResultsTab, setActiveResultsTab] = useState<ResultsTab>("recommendations");
  const [selectedPickId, setSelectedPickId] = useState<string | null>(null);

  const topSuggestion = data?.suggestions[0];
  const selectedPick = data?.suggestions.find((suggestion) => suggestion.id === selectedPickId) ?? null;
  const hasSelectedCity = selectedCity !== null && selectedCity.name === context.city;
  const ownedSuggestions = suggestionCatalog.filter((suggestion) => suggestion.ownerUserId === userId);
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
        body: JSON.stringify({
          ...weatherContext,
          userId: nextUserId,
          place: {
            city: nextSelectedCity.displayName,
            latitude: nextSelectedCity.latitude,
            longitude: nextSelectedCity.longitude
          }
        })
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
      body: JSON.stringify({ userId, suggestionId: suggestion.id, liked, context, suggestion })
    });
    await loadRecommendations();
  }

  async function loadSuggestionCatalog(nextUserId = userId) {
    if (!nextUserId) return;

    try {
      const response = await fetch(`/api/suggestions?userId=${encodeURIComponent(nextUserId)}`);
      if (!response.ok) throw new Error("Could not load suggestions.");

      const payload = (await response.json()) as { suggestions: Suggestion[] };
      setSuggestionCatalog(payload.suggestions);
    } catch (catalogError) {
      console.error(catalogError);
      setSuggestionMessage("Suggestions could not be loaded.");
    }
  }

  async function saveSuggestion() {
    if (!userId) return;

    setSavingSuggestion(true);
    setSuggestionMessage(null);

    const body = {
      ...suggestionForm,
      id: editingSuggestionId,
      userId,
      distanceMiles: Number(suggestionForm.distanceMiles),
      durationHours: Number(suggestionForm.durationHours),
      tags: suggestionForm.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    };

    try {
      const response = await fetch("/api/suggestions", {
        method: editingSuggestionId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save suggestion.");

      setSuggestionForm(emptySuggestionForm);
      setEditingSuggestionId(null);
      setSuggestionMessage(editingSuggestionId ? "Suggestion updated." : "Suggestion created.");
      await loadSuggestionCatalog(userId);
      if (hasSelectedCity) await loadRecommendations(context, userId, selectedCity);
    } catch (saveError) {
      setSuggestionMessage(saveError instanceof Error ? saveError.message : "Could not save suggestion.");
    } finally {
      setSavingSuggestion(false);
    }
  }

  function editSuggestion(suggestion: Suggestion) {
    setEditingSuggestionId(suggestion.id);
    setSuggestionForm({
      title: suggestion.title,
      category: suggestion.category,
      description: suggestion.description,
      locationLabel: suggestion.locationLabel,
      cost: suggestion.cost,
      distanceMiles: String(suggestion.distanceMiles),
      durationHours: String(suggestion.durationHours),
      energy: suggestion.energy,
      social: suggestion.social,
      weatherFit: suggestion.weatherFit,
      tags: suggestion.tags.join(", "),
      source: suggestion.source
    });
    setSuggestionMessage(null);
  }

  async function deleteSuggestion(suggestion: Suggestion) {
    if (!userId || !window.confirm(`Delete "${suggestion.title}" from your suggestions?`)) return;

    setDeletingSuggestionId(suggestion.id);
    setSuggestionMessage(null);

    try {
      const response = await fetch("/api/suggestions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: suggestion.id, userId })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not delete suggestion.");

      if (editingSuggestionId === suggestion.id) {
        setEditingSuggestionId(null);
        setSuggestionForm(emptySuggestionForm);
      }

      setSuggestionMessage("Suggestion deleted.");
      await loadSuggestionCatalog(userId);
      if (hasSelectedCity) await loadRecommendations(context, userId, selectedCity);
    } catch (deleteError) {
      setSuggestionMessage(deleteError instanceof Error ? deleteError.message : "Could not delete suggestion.");
    } finally {
      setDeletingSuggestionId(null);
    }
  }

  useEffect(() => {
    async function initializePlanner() {
      const existingUserId = window.localStorage.getItem(userStorageKey);
      const nextUserId = existingUserId || window.crypto.randomUUID();
      const savedTemperatureUnit = window.localStorage.getItem(temperatureUnitStorageKey);
      window.localStorage.setItem(userStorageKey, nextUserId);
      setUserId(nextUserId);
      void loadSuggestionCatalog(nextUserId);
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

        <section className="suggestionBuilder" aria-label="Create or edit suggestion">
          <div className="sectionHeader">
            <div>
              <span className="eyebrow">Your ideas</span>
              <h2>{editingSuggestionId ? "Edit suggestion" : "New suggestion"}</h2>
            </div>
            {editingSuggestionId ? (
              <button
                aria-label="Cancel editing"
                className="iconButton"
                type="button"
                onClick={() => {
                  setEditingSuggestionId(null);
                  setSuggestionForm(emptySuggestionForm);
                  setSuggestionMessage(null);
                }}
              >
                <X size={17} />
              </button>
            ) : null}
          </div>

          <label className="field">
            <span>Title</span>
            <input
              value={suggestionForm.title}
              onChange={(event) => setSuggestionForm({ ...suggestionForm, title: event.target.value })}
              placeholder="Sunday market browse"
            />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              value={suggestionForm.description}
              onChange={(event) => setSuggestionForm({ ...suggestionForm, description: event.target.value })}
              placeholder="A quick, low-pressure outing with a snack stop."
            />
          </label>
          <label className="field">
            <span>Location</span>
            <input
              value={suggestionForm.locationLabel}
              onChange={(event) => setSuggestionForm({ ...suggestionForm, locationLabel: event.target.value })}
              placeholder="Nearby market street"
            />
          </label>

          <div className="grid2">
            <SelectField
              icon={null}
              label="Category"
              value={suggestionForm.category}
              options={categoryOptions}
              onChange={(category) => setSuggestionForm({ ...suggestionForm, category: category as SuggestionCategory })}
            />
            <SelectField
              icon={null}
              label="Cost"
              value={suggestionForm.cost}
              options={["free", "low", "medium", "high"]}
              onChange={(cost) => setSuggestionForm({ ...suggestionForm, cost: cost as CostLevel })}
            />
          </div>

          <div className="grid2">
            <label className="field">
              <span>Distance</span>
              <input
                min="0"
                step="0.1"
                type="number"
                value={suggestionForm.distanceMiles}
                onChange={(event) => setSuggestionForm({ ...suggestionForm, distanceMiles: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Hours</span>
              <input
                min="0.25"
                step="0.25"
                type="number"
                value={suggestionForm.durationHours}
                onChange={(event) => setSuggestionForm({ ...suggestionForm, durationHours: event.target.value })}
              />
            </label>
          </div>

          <div className="grid2">
            <SelectField
              icon={null}
              label="Energy"
              value={suggestionForm.energy}
              options={["low", "medium", "high"]}
              onChange={(energy) => setSuggestionForm({ ...suggestionForm, energy: energy as EnergyLevel })}
            />
            <SelectField
              icon={null}
              label="Social"
              value={suggestionForm.social}
              options={["solo", "pair", "group", "flexible"]}
              onChange={(social) => setSuggestionForm({ ...suggestionForm, social: social as SocialSetting })}
            />
          </div>

          <div className="field">
            <span>Weather fit</span>
            <div className="tags">
              {weatherOptions.map((weather) => {
                const selected = suggestionForm.weatherFit.includes(weather);
                return (
                  <button
                    className={selected ? "tag selected" : "tag"}
                    key={weather}
                    type="button"
                    onClick={() =>
                      setSuggestionForm({
                        ...suggestionForm,
                        weatherFit: selected
                          ? suggestionForm.weatherFit.filter((item) => item !== weather)
                          : [...suggestionForm.weatherFit, weather]
                      })
                    }
                  >
                    {weather}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="field">
            <span>Tags</span>
            <input
              value={suggestionForm.tags}
              onChange={(event) => setSuggestionForm({ ...suggestionForm, tags: event.target.value })}
              placeholder="food, low-planning, fresh-air"
            />
          </label>

          <button className="secondaryButton" type="button" onClick={saveSuggestion} disabled={savingSuggestion}>
            {editingSuggestionId ? <Save size={17} /> : <Plus size={17} />}
            {savingSuggestion ? "Saving..." : editingSuggestionId ? "Save changes" : "Add suggestion"}
          </button>
          <div className="statusLine" role="status">
            {suggestionMessage || `${ownedSuggestions.length} personal suggestion${ownedSuggestions.length === 1 ? "" : "s"}`}
          </div>
        </section>
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
          <Metric icon={<CloudSun size={18} />} label="Live events" value={String(data?.liveEventCount ?? 0)} />
          <Metric icon={<CalendarDays size={18} />} label="Live places" value={String(data?.livePlaceCount ?? 0)} />
        </div>

        <div className="resultTabs" role="tablist" aria-label="Planner result views">
          <button
            aria-selected={activeResultsTab === "recommendations"}
            className={activeResultsTab === "recommendations" ? "active" : ""}
            role="tab"
            type="button"
            onClick={() => setActiveResultsTab("recommendations")}
          >
            Picks <span>{data?.suggestions.length ?? 0}</span>
          </button>
          <button
            aria-selected={activeResultsTab === "events"}
            className={activeResultsTab === "events" ? "active" : ""}
            role="tab"
            type="button"
            onClick={() => setActiveResultsTab("events")}
          >
            Events <span>{data?.liveEventCount ?? 0}</span>
          </button>
        </div>

        {selectedPick ? (
          <PickDetailView
            pick={selectedPick}
            places={getRelevantPlacesForPick(selectedPick, data?.livePlaces ?? [])}
            onBack={() => setSelectedPickId(null)}
          />
        ) : activeResultsTab === "recommendations" ? (
          <div className="suggestionList" role="tabpanel">
            {data?.suggestions.map((suggestion) => (
              <SuggestionCard
                feedbackValue={feedbackState[suggestion.id]}
                key={suggestion.id}
                relatedPlaceCount={getRelevantPlacesForPick(suggestion, data.livePlaces).length}
                suggestion={suggestion}
                onFeedback={submitFeedback}
                onOpenPlaces={() => setSelectedPickId(suggestion.id)}
              />
            ))}
          </div>
        ) : null}

        {activeResultsTab === "events" ? (
          <LiveSuggestionList
            emptyText="Ticketmaster did not return nearby events for this city and search window."
            items={data?.liveEvents ?? []}
            kind="event"
          />
        ) : null}

        <section className="ownedSuggestions" aria-label="Your saved suggestions">
          <div className="sectionHeader">
            <div>
              <span className="eyebrow">Saved by you</span>
              <h2>{ownedSuggestions.length ? "Personal suggestions" : "No personal suggestions yet"}</h2>
            </div>
          </div>
          {ownedSuggestions.length ? (
            <div className="ownedSuggestionList">
              {ownedSuggestions.map((suggestion) => (
                <article className="ownedSuggestion" key={suggestion.id}>
                  <div>
                    <span className="source">{suggestion.category}</span>
                    <h3>{suggestion.title}</h3>
                    <p>{suggestion.description}</p>
                  </div>
                  <div className="ownedSuggestionActions">
                    <button className="iconButton" type="button" aria-label={`Edit ${suggestion.title}`} onClick={() => editSuggestion(suggestion)}>
                      <Edit3 size={17} />
                    </button>
                    <button
                      className="iconButton danger"
                      type="button"
                      aria-label={`Delete ${suggestion.title}`}
                      onClick={() => deleteSuggestion(suggestion)}
                      disabled={deletingSuggestionId === suggestion.id}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="emptyText">Create one in the left panel and it will join your recommendation pool.</p>
          )}
        </section>
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

function SuggestionCard({
  suggestion,
  feedbackValue,
  relatedPlaceCount,
  onFeedback,
  onOpenPlaces
}: {
  suggestion: ScoredSuggestion;
  feedbackValue: boolean | undefined;
  relatedPlaceCount: number;
  onFeedback: (suggestion: ScoredSuggestion, liked: boolean) => void;
  onOpenPlaces: () => void;
}) {
  return (
    <article className="suggestionCard">
      <div className="cardTop">
        <div>
          <div className="sourceRow">
            <span className="source">{suggestion.source}</span>
            {suggestion.id.startsWith("ticketmaster-") ? <span className="eventSource">Live event</span> : null}
          </div>
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
      {relatedPlaceCount > 0 ? (
        <button className="detailButton" type="button" onClick={onOpenPlaces}>
          View nearby options <span>{relatedPlaceCount}</span>
        </button>
      ) : null}
      <div className="feedbackRow">
        <button
          aria-label={`Like ${suggestion.title}`}
          className={feedbackValue === true ? "iconButton active" : "iconButton"}
          type="button"
          onClick={() => onFeedback(suggestion, true)}
        >
          <ThumbsUp size={17} />
        </button>
        <button
          aria-label={`Dislike ${suggestion.title}`}
          className={feedbackValue === false ? "iconButton active" : "iconButton"}
          type="button"
          onClick={() => onFeedback(suggestion, false)}
        >
          <ThumbsDown size={17} />
        </button>
      </div>
    </article>
  );
}

function PickDetailView({
  pick,
  places,
  onBack
}: {
  pick: ScoredSuggestion;
  places: Suggestion[];
  onBack: () => void;
}) {
  return (
    <section className="pickDetail" role="tabpanel">
      <button className="backButton" type="button" onClick={onBack}>
        <ArrowLeft size={16} />
        Back to picks
      </button>
      <div className="pickDetailHeader">
        <div>
          <span className="eyebrow">Nearby options for</span>
          <h2>{pick.title}</h2>
        </div>
        <span className="pill">{places.length}</span>
      </div>
      <p>{pick.description}</p>
      {places.length > 0 ? (
        <LiveSuggestionList
          emptyText="No matching places found for this pick."
          items={places}
          kind="place"
        />
      ) : (
        <div className="liveDataEmpty">No matching places found for this pick.</div>
      )}
    </section>
  );
}

function LiveSuggestionList({
  items,
  kind,
  emptyText
}: {
  items: Suggestion[];
  kind: "place" | "event";
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <div className="liveDataEmpty" role="tabpanel">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="liveDataList" role="tabpanel">
      {items.map((item) => (
        <article className="liveDataCard" key={item.id}>
          <div className="cardTop">
            <div>
              <div className="sourceRow">
                <span className="source">{item.category}</span>
                <span className={kind === "event" ? "eventSource" : "placeSource"}>
                  {kind === "event" ? "Live event" : "Live city place"}
                </span>
              </div>
              <h3>{item.title}</h3>
            </div>
          </div>
          <p>{item.description}</p>
          <div className="metaRow">
            <span>{item.cost}</span>
            <span>{item.distanceMiles.toFixed(1)} mi</span>
            <span>{item.durationHours}h</span>
            <span>{item.locationLabel}</span>
          </div>
          <div className="reasonRow">
            {item.tags.slice(0, 4).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          {item.externalUrl ? (
            <a className="eventLink" href={item.externalUrl} target="_blank" rel="noreferrer">
              View event
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function getRelevantPlacesForPick(pick: Suggestion, places: Suggestion[]) {
  return places
    .filter((place) => {
      if (pick.category === "food") return place.category === "food";
      if (pick.category === "outdoors") return place.category === "outdoors";
      if (pick.category === "culture") return place.category === "culture";
      if (pick.category === "productive") {
        return place.category === "productive" || place.tags.includes("focus");
      }
      if (pick.category === "fitness") return place.category === "fitness";
      if (pick.category === "social") {
        return place.category === "social" || place.category === "food" || place.tags.includes("connection");
      }

      const sharedTags = place.tags.filter((tag) => pick.tags.includes(tag));
      return sharedTags.length >= 2;
    })
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 12);
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
