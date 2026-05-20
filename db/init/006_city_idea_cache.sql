create table if not exists city_idea_cache (
  cache_key text primary key,
  city text not null,
  context jsonb not null,
  drafts jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists city_idea_cache_expires_idx
  on city_idea_cache (expires_at);
