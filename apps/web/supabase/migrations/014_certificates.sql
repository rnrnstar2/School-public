-- Migration: certificates
-- Purpose: Store issued graduation certificates with unique IDs for online verification.

create table if not exists certificates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  plan_id    text not null,
  track_id   text,
  learner_name   text,
  goal_summary   text not null,
  plan_title     text,
  completed_at   timestamptz not null,
  milestone_count   int not null default 0,
  criteria_count    int not null default 0,
  criteria_labels   text[] not null default '{}',
  artifact_urls     text[] not null default '{}',
  ai_tools_used     text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Index for fast lookup by user
create index if not exists idx_certificates_user_id on certificates(user_id);

-- Enable RLS
alter table certificates enable row level security;

-- Users can read own certificates
create policy "Users can read own certificates"
  on certificates for select
  using (auth.uid() = user_id);

-- Users can insert own certificates
create policy "Users can insert own certificates"
  on certificates for insert
  with check (auth.uid() = user_id);

-- Anyone can read a certificate by ID (for verification)
create policy "Anyone can verify certificate by id"
  on certificates for select
  using (true);
