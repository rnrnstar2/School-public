-- Exercise results: records learner's interactive exercise submissions
create table if not exists exercise_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null,
  exercise_id text not null,
  code text not null,
  passed boolean not null default false,
  matched_patterns text[] not null default '{}',
  missing_patterns text[] not null default '{}',
  attempt_number integer not null default 1,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_exercise_results_user_lesson
  on exercise_results(user_id, lesson_id);
create index if not exists idx_exercise_results_exercise
  on exercise_results(user_id, exercise_id);

-- RLS
alter table exercise_results enable row level security;

create policy "Users can read own exercise results"
  on exercise_results for select using (auth.uid() = user_id);

create policy "Users can insert own exercise results"
  on exercise_results for insert with check (auth.uid() = user_id);
