create table if not exists feedback (
  id bigserial primary key,
  user_id text not null,
  suggestion_id text not null,
  liked boolean not null,
  features jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists feedback_user_created_at_idx
  on feedback (user_id, created_at desc);
