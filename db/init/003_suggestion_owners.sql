alter table suggestions
  add column if not exists owner_user_id text;

create index if not exists suggestions_owner_active_idx
  on suggestions (owner_user_id, active);
