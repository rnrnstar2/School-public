-- ============================================================
-- 023: Email notification preferences
-- TQ-94: メール通知基盤+学習リマインダーメール配信
-- ============================================================

-- ── email_notification_preferences table ──
create table if not exists public.email_notification_preferences (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean   not null default false,
  frequency     text      not null default 'daily'
    check (frequency in ('daily', 'weekly', 'never')),
  milestone_emails boolean not null default true,
  graduation_emails boolean not null default true,
  last_reminder_sent_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.email_notification_preferences is
  'メール通知のオプトイン/アウト設定と配信頻度';

-- ── email_notification_log (送信ログ) ──
create table if not exists public.email_notification_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  email_type    text not null
    check (email_type in ('streak_reminder', 'milestone', 'graduation')),
  sent_at       timestamptz not null default now(),
  metadata      jsonb default '{}'
);

comment on table public.email_notification_log is
  '送信済みメール通知の履歴ログ';

create index if not exists idx_email_log_user_sent
  on public.email_notification_log (user_id, sent_at desc);

-- ── RLS ──
alter table public.email_notification_preferences enable row level security;
alter table public.email_notification_log enable row level security;

-- Users can read/write their own preferences
create policy "Users manage own email prefs"
  on public.email_notification_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can read their own email log
create policy "Users read own email log"
  on public.email_notification_log
  for select
  using (auth.uid() = user_id);

-- Service role can insert logs (for cron/API)
create policy "Service can insert email log"
  on public.email_notification_log
  for insert
  with check (true);
