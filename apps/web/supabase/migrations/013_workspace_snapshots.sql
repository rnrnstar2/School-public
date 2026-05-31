-- Migration: workspace_snapshots
-- Purpose: Persist PlannerWorkspaceSnapshot per user per goal for cross-device sync.
-- Conflict resolution: last-write-wins based on saved_at timestamp.

create table if not exists workspace_snapshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  goal_key   text not null,                -- normalized goal (lowercase/trimmed)
  snapshot   jsonb not null default '{}'::jsonb,  -- full PlannerWorkspaceSnapshot
  saved_at   timestamptz not null default now(),  -- client-side savedAt for conflict resolution
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workspace_snapshots_user_goal_uq unique (user_id, goal_key)
);

-- Index for fast lookup by user
create index if not exists idx_workspace_snapshots_user_id on workspace_snapshots(user_id);

-- Enable RLS
alter table workspace_snapshots enable row level security;

-- Users can only access their own snapshots
create policy "Users can read own workspace snapshots"
  on workspace_snapshots for select
  using (auth.uid() = user_id);

create policy "Users can insert own workspace snapshots"
  on workspace_snapshots for insert
  with check (auth.uid() = user_id);

create policy "Users can update own workspace snapshots"
  on workspace_snapshots for update
  using (auth.uid() = user_id);

create policy "Users can delete own workspace snapshots"
  on workspace_snapshots for delete
  using (auth.uid() = user_id);
