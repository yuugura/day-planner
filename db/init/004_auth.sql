create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists auth_sessions (
  id bigserial primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_idx
  on auth_sessions (user_id);

create index if not exists auth_sessions_expires_idx
  on auth_sessions (expires_at);
