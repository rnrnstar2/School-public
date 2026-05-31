-- Track unsupported goal inputs for future track expansion analysis
create table if not exists unsupported_goal_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  goal text not null,
  normalized_goal text not null,
  matched_intent text not null default 'unsupported',
  support_status text not null default 'coming-soon',
  hearing jsonb,
  created_at timestamptz not null default now()
);

-- Index for analysis queries
create index if not exists idx_unsupported_goal_log_created
  on unsupported_goal_log (created_at desc);

create index if not exists idx_unsupported_goal_log_normalized
  on unsupported_goal_log (normalized_goal);

-- RLS
alter table unsupported_goal_log enable row level security;

create policy "Users can insert their own unsupported goal logs"
  on unsupported_goal_log for insert
  with check (auth.uid() = user_id);

create policy "Users can read their own unsupported goal logs"
  on unsupported_goal_log for select
  using (auth.uid() = user_id);
