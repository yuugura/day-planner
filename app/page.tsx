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
  ThumbsDown,
  ThumbsUp,
  Users
} from "lucide-react";
import type { CostLevel, DayContext, EnergyLevel, ScoredSuggestion, SocialSetting, WeatherCondition } from "@/lib/types";

type PlannerResponse = {
  context: DayContext;
  summary: string;
  suggestions: ScoredSuggestion[];
  trainingExamples: number;
};

const tagOptions = ["fresh-air", "food", "focus", "art", "movement", "connection", "creative", "low-planning"];
const userStorageKey = "day-planner-user-id";

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

  const topSuggestion = data?.suggestions[0];

  async function loadRecommendations(nextContext = context, nextUserId = userId) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...nextContext, userId: nextUserId })
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
      setError("Could not refresh recommendations. Check the dev server and database connection.");
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
    const existingUserId = window.localStorage.getItem(userStorageKey);
    const nextUserId = existingUserId || window.crypto.randomUUID();
    window.localStorage.setItem(userStorageKey, nextUserId);
    setUserId(nextUserId);
    void loadRecommendations(initialContext, nextUserId);
  }, []);

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

        <label className="field">
          <span>
            <MapPin size={16} /> City
          </span>
          <input
            value={context.city}
            onChange={(event) => setContext({ ...context, city: event.target.value })}
            placeholder="Toronto"
          />
        </label>

        <div className="grid2">
          <SelectField
            icon={<CloudSun size={16} />}
            label="Weather"
            value={context.weather}
            options={["clear", "cloudy", "rain", "snow", "hot", "cold"]}
            onChange={(weather) => setContext({ ...context, weather: weather as WeatherCondition })}
          />
          <SelectField
            icon={<DollarSign size={16} />}
            label="Budget"
            value={context.budget}
            options={["free", "low", "medium", "high"]}
            onChange={(budget) => setContext({ ...context, budget: budget as CostLevel })}
          />
        </div>

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

        <button className="primaryButton" type="button" onClick={() => loadRecommendations()} disabled={loading}>
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
