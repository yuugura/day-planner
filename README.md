# Day Planner

A Next.js app for deciding what to do today using city context, weather, activities, everyday ideas, productive suggestions, and a hybrid recommender.

## Environment

Use `.env.example` as the safe template, then put real local values in `.env.local`:

```bash
cp .env.example .env.local
```

```bash
DATABASE_URL="postgres://day_planner:day_planner@localhost:5433/day_planner"
GEMINI_API_KEY="..."
```

The app works with in-memory demo data and fallback summary text when those variables are absent or blank. `.env.local` is ignored by Git.

## Local Postgres

Start Postgres with Docker:

```bash
docker compose up -d postgres
```

The container exposes Postgres on local port `5433` to avoid colliding with any existing Postgres server on `5432`. It initializes the feedback table from `db/init/001_feedback.sql` the first time the volume is created. To inspect the database from Docker:

```bash
docker compose exec postgres psql -U day_planner -d day_planner
```

## Database Schema

```sql
create table if not exists feedback (
  id bigserial primary key,
  user_id text not null,
  suggestion_id text not null,
  liked boolean not null,
  features jsonb not null,
  created_at timestamptz not null default now()
);
```

## Recommender

The recommender is hybrid:

- Cold-start rules score weather fit, budget, distance, energy match, social setting, time of day, and preference tags.
- Logistic regression learns per-user like probability from feedback using features for category, weather, cost, distance, energy, social setting, and tags.
- Final ranking blends both scores and adds a small exploration bonus so the day does not collapse into one familiar category.
