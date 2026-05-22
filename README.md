# What Now

## Overview

What Now helps you decide what to do right now. It combines your city, current weather, available time, budget, energy, social preference, saved ideas, live nearby options, and feedback history into a short list of timely suggestions.

The app is meant for moments when you want a useful nudge, not a full itinerary. It can work as a lightweight anonymous recommender, or it can use optional accounts to keep personal suggestions and preference memory across sessions.

## Features

- City autocomplete with current weather context from Open-Meteo.
- Metric-first UI with Celsius, km/h, and kilometer distances.
- Nearby place options from OpenStreetMap/Overpass for matching picks.
- Optional live event suggestions from Ticketmaster when an API key is configured.
- AI city ideas from Gemini, with deterministic fallback ideas when Gemini is unavailable.
- Personal suggestions that can be created, edited, archived, and included in recommendations.
- Like/dislike feedback that trains a lightweight preference model over time.
- Preference memory showing recent feedback and learned patterns.
- Anonymous mode by default, with optional email/password accounts for persistence.
- Graceful fallbacks for missing Postgres, API keys, live integrations, and remote failures.

## How It Works

What Now is a Next.js App Router app with React UI and API routes in the same project. The main interface lives in `app/page.tsx`, while recommendation, feedback, weather, city search, auth, and suggestion APIs live under `app/api`.

Suggestion data is Postgres-first through `lib/suggestions.ts`. If Postgres is missing, unreachable, or empty, the app falls back to built-in demo suggestions from `lib/sample-data.ts`. Feedback also falls back to in-memory storage when the database is unavailable.

The recommender in `lib/recommender.ts` blends two approaches:

- Cold-start rules score weather fit, budget, duration, distance, energy, social setting, time of day, and preference tags.
- A small logistic regression model learns from user feedback and predicts which suggestions the user is likely to enjoy.

External integrations are optional. Open-Meteo powers city and weather lookup without an API key. OpenStreetMap/Overpass provides nearby place suggestions. Ticketmaster can add live events when configured. Gemini can generate city-flavored idea drafts, but the app still works with fallback text when Gemini is unavailable.

## API Routes

- `POST /api/recommend` ranks suggestions for the submitted moment context and returns picks, nearby places, live events, and summary text.
- `POST /api/feedback` records like/dislike feedback for personalization.
- `GET /api/memory` summarizes recent likes/dislikes and learned preference patterns.
- `DELETE /api/memory` clears saved preference memory.
- `GET /api/suggestions` lists active suggestions for the current user or anonymous session.
- `POST /api/suggestions`, `PUT /api/suggestions`, and `DELETE /api/suggestions` create, update, and archive personal suggestions.
- `GET /api/cities?query=...` returns city autocomplete results from Open-Meteo geocoding.
- `GET /api/weather?city=...` fetches current city weather and maps it into the recommender context.
- `POST /api/places` refreshes nearby OpenStreetMap options for the selected area.
- `GET /api/location/reverse` resolves browser coordinates into a nearby place label.
- `POST /api/city-ideas` generates city idea drafts through Gemini or fallback logic.
- `GET /api/auth/session` reads the current signed-in user.
- `POST /api/auth/signup`, `POST /api/auth/signin`, and `POST /api/auth/signout` manage optional account sessions.
- `POST /api/auth/claim` migrates anonymous suggestions and feedback into a signed-in account.
- `POST /api/auth/password-reset/request` creates a short-lived password reset link.
- `POST /api/auth/password-reset/confirm` resets the password and starts a new session.

Expensive POST routes use a small in-process per-client rate limit to reduce accidental API/key burn.

## Data & Privacy Notes

Anonymous mode uses a browser-local user id so feedback and personal suggestions can work without an account. Signing in can claim anonymous suggestions and feedback into the real account.

When Postgres is configured, accounts, sessions, feedback, feedback snapshots, city idea cache entries, and personal suggestions can be persisted. Without Postgres, the app keeps working with demo suggestions and in-memory feedback, but that memory is not durable across server restarts.

Browser geolocation is opt-in. The app only asks for current location when the user selects Current location for nearby options; otherwise it uses the selected city coordinates.

Live place and event suggestions are transient. OpenStreetMap and Ticketmaster results are normalized into the same suggestion shape for ranking/display, but they are not saved as personal suggestions unless the user creates their own entry.

## Troubleshooting

- **The app is showing demo or fallback suggestions.** Postgres is probably unavailable, empty, or not configured. The app intentionally falls back to built-in suggestions so the recommender remains usable.
- **Live places are missing.** OpenStreetMap/Overpass may be unavailable, rate-limited, or unable to find matching places near the selected area. Stored suggestions should still appear.
- **Live events are missing.** Ticketmaster events require a configured API key and relevant events near the selected city. Without that, the Events tab can be empty.
- **Password reset emails are not sending.** Resend email delivery requires email configuration. In development, reset links can still be shown in the UI when email is unavailable.
- **City or weather lookup fails.** Open-Meteo may be temporarily unavailable or the city text may not match a selectable result. Choose a city from autocomplete before asking for ideas.
- **Feedback memory does not persist.** Durable memory requires Postgres. Without it, feedback can fall back to in-memory storage and disappear after a server restart.
