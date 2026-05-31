-- ============================================================
-- 025: In-app notifications
-- TQ-99: インアプリ通知センター+学習イベント統合表示
-- ============================================================

-- ── notifications table ──
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null
    check (type in (
      'milestone_reached',
      'streak_update',
      'lesson_recommendation',
      'plan_revision',
      'artifact_verified'
    )),
  title         text not null,
  body          text not null default '',
  read          boolean not null default false,
  link          text,
  created_at    timestamptz not null default now()
);

comment on table public.notifications is
  'インアプリ通知の履歴（学習イベント統合フィード）';

comment on column public.notifications.type is
  '通知種別: milestone_reached / streak_update / lesson_recommendation / plan_revision / artifact_verified';

create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, read)
  where read = false;

-- ── notification_preferences table ──
create table if not exists public.notification_preferences (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  in_app_milestone        boolean not null default true,
  in_app_streak           boolean not null default true,
  in_app_lesson_recommendation boolean not null default true,
  in_app_plan_revision    boolean not null default true,
  in_app_artifact_verified boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.notification_preferences is
  'インアプリ通知の種類別ON/OFF設定';

-- ── RLS ──
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

-- Users can read/delete their own notifications
create policy "Users read own notifications"
  on public.notifications
  for select
  using (auth.uid() = user_id);

create policy "Users update own notifications"
  on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own notifications"
  on public.notifications
  for delete
  using (auth.uid() = user_id);

-- Service role can insert notifications
create policy "Service can insert notifications"
  on public.notifications
  for insert
  with check (true);

-- Users manage own notification preferences
create policy "Users manage own notification prefs"
  on public.notification_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
