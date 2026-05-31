-- goal_history: ゴール履歴管理テーブル
-- ユーザーが過去に取り組んだゴールを記録し、切替・再開を可能にする

create table if not exists goal_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  goal        text not null,
  plan_id     uuid references plans(id) on delete set null,
  status      text not null default 'active'
                check (status in ('active', 'archived', 'completed')),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- RLS
alter table goal_history enable row level security;

create policy "Users can view own goal history"
  on goal_history for select
  using (auth.uid() = user_id);

create policy "Users can insert own goal history"
  on goal_history for insert
  with check (auth.uid() = user_id);

create policy "Users can update own goal history"
  on goal_history for update
  using (auth.uid() = user_id);

-- Index for fast lookup
create index idx_goal_history_user_id on goal_history(user_id, started_at desc);
