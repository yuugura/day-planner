alter table feedback
  add column if not exists suggestion_snapshot jsonb;
