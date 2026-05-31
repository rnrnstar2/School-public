-- AI応答品質フィードバックテーブル
-- 各チャット応答に対する👍/👎評価+理由を保存

create table if not exists ai_response_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_context text not null check (chat_context in ('lesson', 'hearing', 'mentor')),
  context_id text, -- lesson_id, goal, etc.
  message_id text not null, -- client-generated message id
  rating text not null check (rating in ('positive', 'negative')),
  reason text check (reason in ('off_topic', 'already_known', 'unclear', 'too_simple', 'too_complex', 'repetitive', 'other')),
  comment text,
  assistant_message_preview text, -- first 200 chars of the AI response
  created_at timestamptz not null default now()
);

-- Index for querying user's negative feedback for prompt injection
create index idx_ai_response_feedback_user_negative
  on ai_response_feedback (user_id, rating, created_at desc)
  where rating = 'negative';

-- Index for querying by context
create index idx_ai_response_feedback_context
  on ai_response_feedback (user_id, chat_context, context_id);

-- RLS
alter table ai_response_feedback enable row level security;

create policy "Users can insert own feedback"
  on ai_response_feedback for insert
  with check (auth.uid() = user_id);

create policy "Users can read own feedback"
  on ai_response_feedback for select
  using (auth.uid() = user_id);
