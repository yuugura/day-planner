# Day Planner

A Next.js app for deciding what to do today using city context, weather, activities, everyday ideas, productive suggestions, and a hybrid recommender.

## Environment

Create `.env.local` when you want live integrations:

```bash
DATABASE_URL="postgres://user:password@localhost:5432/day_planner"
GEMINI_API_KEY="..."
```

The app works with in-memory demo data when those variables are absent.

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
