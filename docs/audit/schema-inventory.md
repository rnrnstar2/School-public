# Database Schema Inventory

Generated: 2026-04-04
Source: `apps/web/supabase/migrations/001..026` + `apps/web/supabase/seed.sql`

---

## Table of Contents

1. [Tables and Columns](#1-tables-and-columns)
2. [Foreign Key Relationships](#2-foreign-key-relationships)
3. [RLS Policies](#3-rls-policies)
4. [Triggers and Functions](#4-triggers-and-functions)
5. [Indexes](#5-indexes)
6. [Check Constraints and Custom Types](#6-check-constraints-and-custom-types)
7. [Relationship Diagram](#7-relationship-diagram)

---

## 1. Tables and Columns

### 1.1 `themes` (001)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| title | TEXT | NOT NULL |
| description | TEXT | |
| icon | TEXT | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

### 1.2 `courses` (001)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| theme_id | UUID | FK -> themes(id) ON DELETE SET NULL |
| title | TEXT | NOT NULL |
| description | TEXT | |
| thumbnail | TEXT | |
| difficulty | TEXT | NOT NULL, DEFAULT 'beginner', CHECK IN (beginner, intermediate, advanced) |
| order_index | INTEGER | NOT NULL, DEFAULT 0 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

### 1.3 `lessons` (001, altered in 020, 021, 024)

| Column | Type | Constraints | Migration |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 001 |
| course_id | UUID | NOT NULL, FK -> courses(id) ON DELETE CASCADE | 001 |
| title | TEXT | NOT NULL | 001 |
| content | TEXT | | 001 |
| video_url | TEXT | | 001 |
| order_index | INTEGER | NOT NULL, DEFAULT 0 | 001 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 001 |
| module_id | TEXT | FK -> modules(id) ON DELETE SET NULL | 020 |
| content_types | TEXT[] | NOT NULL, DEFAULT '{}' | 021 |
| track_id | TEXT | | 024 |
| difficulty_level | TEXT | DEFAULT 'beginner', CHECK IN (beginner, intermediate, advanced) | 024 |
| tags | TEXT[] | NOT NULL, DEFAULT '{}' | 024 |
| prerequisite_ids | TEXT[] | NOT NULL, DEFAULT '{}' | 024 |
| why_this_matters | TEXT | | 024 |
| how_to_do | TEXT | | 024 |
| common_blockers | TEXT | | 024 |
| confirmation_method | TEXT | | 024 |

### 1.4 `assignments` (001)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| lesson_id | UUID | NOT NULL, FK -> lessons(id) ON DELETE CASCADE |
| title | TEXT | NOT NULL |
| description | TEXT | |
| due_date | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

### 1.5 `user_progress` (001)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE |
| course_id | UUID | FK -> courses(id) ON DELETE CASCADE |
| lesson_id | UUID | FK -> lessons(id) ON DELETE CASCADE |
| completed | BOOLEAN | NOT NULL, DEFAULT FALSE |
| completed_at | TIMESTAMPTZ | |

UNIQUE(user_id, lesson_id)

### 1.6 `submissions` (001)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE |
| assignment_id | UUID | NOT NULL, FK -> assignments(id) ON DELETE CASCADE |
| content | TEXT | |
| file_url | TEXT | |
| grade | INTEGER | CHECK (0..100) |
| feedback | TEXT | |
| submitted_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

UNIQUE(user_id, assignment_id)

### 1.7 `learner_profile` (002, altered in 003)

| Column | Type | Constraints | Migration |
|--------|------|-------------|-----------|
| user_id | UUID | PK, FK -> auth.users(id) ON DELETE CASCADE | 002 |
| display_name | TEXT | | 002 |
| locale | TEXT | NOT NULL, DEFAULT 'ja' | 002 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 002 |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 002 |
| experience_summary | TEXT | | 003 |
| operating_system | TEXT | | 003 |
| cli_familiarity | TEXT | CHECK IN (none, basic, comfortable) OR NULL | 003 |
| available_ai_tools | TEXT[] | NOT NULL, DEFAULT '{}' | 003 |
| can_use_local_tools | BOOLEAN | | 003 |

### 1.8 `learner_state` (002, altered in 003)

| Column | Type | Constraints | Migration |
|--------|------|-------------|-----------|
| user_id | UUID | PK, FK -> auth.users(id) ON DELETE CASCADE | 002 |
| target_outcome | TEXT | | 002 |
| skill_level | TEXT | CHECK IN (beginner, intermediate, advanced) | 002 |
| preferred_pace | TEXT | CHECK IN (relaxed, steady, intensive) | 002 |
| active_track_id | TEXT | | 002 |
| active_task_id | TEXT | | 002 |
| blockers | TEXT[] | NOT NULL, DEFAULT '{}' | 002 |
| signals | JSONB | NOT NULL, DEFAULT '{}' | 002 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 002 |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 002 |
| deadline_text | TEXT | | 003 |
| weekly_time_budget | TEXT | | 003 |
| existing_materials | TEXT | | 003 |

### 1.9 `mentor_memory` (002)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE |
| track_id | TEXT | |
| task_id | TEXT | |
| title | TEXT | NOT NULL |
| bullets | TEXT[] | NOT NULL, DEFAULT '{}' |
| source | TEXT | NOT NULL, DEFAULT 'planner', CHECK IN (planner, mentor, system) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

### 1.10 `artifacts` (004, altered in 006)

| Column | Type | Constraints | Migration |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 004 |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE | 004 |
| planner_goal | TEXT | | 004 |
| track_id | TEXT | | 004 |
| milestone_id | TEXT | NOT NULL | 004 |
| milestone_title | TEXT | | 004 |
| step_id | TEXT | NOT NULL | 004 |
| step_title | TEXT | | 004 |
| artifact_type | TEXT | NOT NULL, CHECK IN (url, text, note) | 004 |
| title | TEXT | | 004 |
| content | TEXT | NOT NULL | 004 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 004 |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 004 |
| task_id (generated) | TEXT | GENERATED ALWAYS AS (step_id) STORED | 006 |
| type (generated) | TEXT | GENERATED ALWAYS AS (artifact_type) STORED | 006 |
| body (generated) | TEXT | GENERATED ALWAYS AS (content) STORED | 006 |

Note: `task_id`, `type`, `body` are computed compatibility aliases. The `task_id` column shadows the `step_id` column name.

### 1.11 `plans` (005, altered in 015)

| Column | Type | Constraints | Migration |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 005 |
| user_id | UUID | FK -> auth.users(id) ON DELETE CASCADE | 005 |
| title | TEXT | NOT NULL | 005 |
| goal | TEXT | | 005 |
| summary | TEXT | | 005 |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | 005 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 005 |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 005 |
| version | INTEGER | NOT NULL, DEFAULT 1 | 015 |
| parent_plan_id | UUID | FK -> plans(id) ON DELETE SET NULL | 015 |

### 1.12 `milestones` (005)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| plan_id | UUID | NOT NULL, FK -> plans(id) ON DELETE CASCADE |
| title | TEXT | NOT NULL |
| description | TEXT | |
| order_index | INTEGER | NOT NULL, DEFAULT 0 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

### 1.13 `milestone_lessons` (005)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| milestone_id | UUID | NOT NULL, FK -> milestones(id) ON DELETE CASCADE |
| lesson_id | UUID | NOT NULL, FK -> lessons(id) ON DELETE CASCADE |
| order_index | INTEGER | NOT NULL, DEFAULT 0 |
| rationale | TEXT | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

UNIQUE(milestone_id, lesson_id)

### 1.14 `lesson_feedback` (007)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE |
| lesson_id | TEXT | NOT NULL |
| difficulty_rating | INT | NOT NULL, CHECK 1..5 |
| clarity_rating | INT | NOT NULL, CHECK 1..5 |
| comment | TEXT | |
| adjustment_proposal | JSONB | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

UNIQUE(user_id, lesson_id)

### 1.15 `task_progress` (008, altered in 019)

| Column | Type | Constraints | Migration |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 008 |
| plan_id | UUID | NOT NULL, FK -> plans(id) ON DELETE CASCADE | 008 |
| task_id | TEXT | NOT NULL | 008 |
| status | TEXT | NOT NULL, DEFAULT 'not-started', CHECK IN (not-started, in-progress, completed, on-hold, blocked, skipped) | 008 |
| do_text | TEXT | | 008 |
| learn_text | TEXT | | 008 |
| why_text | TEXT | | 008 |
| relevant_lesson_ids | TEXT[] | NOT NULL, DEFAULT '{}' | 008 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 008 |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 008 |
| started_at | TIMESTAMPTZ | | 019 |
| completed_at | TIMESTAMPTZ | | 019 |
| elapsed_minutes | INTEGER | | 019 |

UNIQUE(plan_id, task_id)

### 1.16 `unsupported_goal_log` (009)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | FK -> auth.users(id) ON DELETE SET NULL |
| goal | TEXT | NOT NULL |
| normalized_goal | TEXT | NOT NULL |
| matched_intent | TEXT | NOT NULL, DEFAULT 'unsupported' |
| support_status | TEXT | NOT NULL, DEFAULT 'coming-soon' |
| hearing | JSONB | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

### 1.17 `milestone_progress` (010)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE |
| plan_id | UUID | NOT NULL, FK -> plans(id) ON DELETE CASCADE |
| milestone_id | TEXT | NOT NULL |
| milestone_title | TEXT | |
| status | TEXT | NOT NULL, DEFAULT 'in-progress', CHECK IN (in-progress, completed) |
| evidence_rule | TEXT | |
| verified_at | TIMESTAMPTZ | |
| verification_summary | TEXT | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

UNIQUE(user_id, plan_id, milestone_id)

### 1.18 `goal_history` (011)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE |
| goal | TEXT | NOT NULL |
| plan_id | UUID | FK -> plans(id) ON DELETE SET NULL |
| status | TEXT | NOT NULL, DEFAULT 'active', CHECK IN (active, archived, completed) |
| started_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| ended_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

### 1.19 `lesson_chat_messages` (012)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE |
| lesson_id | TEXT | NOT NULL |
| messages | JSONB | NOT NULL, DEFAULT '[]' |
| summary_key_points | TEXT[] | NOT NULL, DEFAULT '{}' |
| summary_updated_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

UNIQUE(user_id, lesson_id)

### 1.20 `workspace_snapshots` (013)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE |
| goal_key | TEXT | NOT NULL |
| snapshot | JSONB | NOT NULL, DEFAULT '{}' |
| saved_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

UNIQUE(user_id, goal_key)

### 1.21 `certificates` (014, altered in 022)

| Column | Type | Constraints | Migration |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 014 |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE | 014 |
| plan_id | TEXT | NOT NULL | 014 |
| track_id | TEXT | | 014 |
| learner_name | TEXT | | 014 |
| goal_summary | TEXT | NOT NULL | 014 |
| plan_title | TEXT | | 014 |
| completed_at | TIMESTAMPTZ | NOT NULL | 014 |
| milestone_count | INT | NOT NULL, DEFAULT 0 | 014 |
| criteria_count | INT | NOT NULL, DEFAULT 0 | 014 |
| criteria_labels | TEXT[] | NOT NULL, DEFAULT '{}' | 014 |
| artifact_urls | TEXT[] | NOT NULL, DEFAULT '{}' | 014 |
| ai_tools_used | TEXT[] | NOT NULL, DEFAULT '{}' | 014 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 014 |
| shared_at | TIMESTAMPTZ | DEFAULT NULL | 022 |

### 1.22 `hearing_chat_messages` (016)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE |
| goal | TEXT | NOT NULL |
| messages | JSONB | NOT NULL, DEFAULT '[]' |
| summary_key_points | TEXT[] | NOT NULL, DEFAULT '{}' |
| completed_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

UNIQUE(user_id, goal)

### 1.23 `mentor_memory_archive` (017)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| original_id | UUID | NOT NULL |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE |
| track_id | TEXT | |
| task_id | TEXT | |
| title | TEXT | NOT NULL |
| bullets | TEXT[] | NOT NULL, DEFAULT '{}' |
| source | TEXT | NOT NULL, DEFAULT 'planner', CHECK IN (planner, mentor, system) |
| created_at | TIMESTAMPTZ | NOT NULL |
| archived_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| compaction_id | UUID | |

### 1.24 `ai_response_feedback` (018)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE |
| chat_context | TEXT | NOT NULL, CHECK IN (lesson, hearing, mentor) |
| context_id | TEXT | |
| message_id | TEXT | NOT NULL |
| rating | TEXT | NOT NULL, CHECK IN (positive, negative) |
| reason | TEXT | CHECK IN (off_topic, already_known, unclear, too_simple, too_complex, repetitive, other) |
| comment | TEXT | |
| assistant_message_preview | TEXT | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

### 1.25 `modules` (020)

| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| track_id | TEXT | NOT NULL |
| title | TEXT | NOT NULL |
| description | TEXT | |
| phase | TEXT | |
| outcome | TEXT | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 |
| status | TEXT | NOT NULL, DEFAULT 'active', CHECK IN (active, draft, archived) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

### 1.26 `email_notification_preferences` (023)

| Column | Type | Constraints |
|--------|------|-------------|
| user_id | UUID | PK, FK -> auth.users(id) ON DELETE CASCADE |
| email_enabled | BOOLEAN | NOT NULL, DEFAULT FALSE |
| frequency | TEXT | NOT NULL, DEFAULT 'daily', CHECK IN (daily, weekly, never) |
| milestone_emails | BOOLEAN | NOT NULL, DEFAULT TRUE |
| graduation_emails | BOOLEAN | NOT NULL, DEFAULT TRUE |
| last_reminder_sent_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

### 1.27 `email_notification_log` (023)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE |
| email_type | TEXT | NOT NULL, CHECK IN (streak_reminder, milestone, graduation) |
| sent_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| metadata | JSONB | DEFAULT '{}' |

### 1.28 `exercise_results` (025)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE |
| lesson_id | TEXT | NOT NULL |
| exercise_id | TEXT | NOT NULL |
| code | TEXT | NOT NULL |
| passed | BOOLEAN | NOT NULL, DEFAULT FALSE |
| matched_patterns | TEXT[] | NOT NULL, DEFAULT '{}' |
| missing_patterns | TEXT[] | NOT NULL, DEFAULT '{}' |
| attempt_number | INTEGER | NOT NULL, DEFAULT 1 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

### 1.29 `notifications` (026)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK -> auth.users(id) ON DELETE CASCADE |
| type | TEXT | NOT NULL, CHECK IN (milestone_reached, streak_update, lesson_recommendation, plan_revision, artifact_verified) |
| title | TEXT | NOT NULL |
| body | TEXT | NOT NULL, DEFAULT '' |
| read | BOOLEAN | NOT NULL, DEFAULT FALSE |
| link | TEXT | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

### 1.30 `notification_preferences` (026)

| Column | Type | Constraints |
|--------|------|-------------|
| user_id | UUID | PK, FK -> auth.users(id) ON DELETE CASCADE |
| in_app_milestone | BOOLEAN | NOT NULL, DEFAULT TRUE |
| in_app_streak | BOOLEAN | NOT NULL, DEFAULT TRUE |
| in_app_lesson_recommendation | BOOLEAN | NOT NULL, DEFAULT TRUE |
| in_app_plan_revision | BOOLEAN | NOT NULL, DEFAULT TRUE |
| in_app_artifact_verified | BOOLEAN | NOT NULL, DEFAULT TRUE |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

---

## 2. Foreign Key Relationships

| Source Table | Source Column | Target Table | Target Column | ON DELETE |
|---|---|---|---|---|
| courses | theme_id | themes | id | SET NULL |
| lessons | course_id | courses | id | CASCADE |
| lessons | module_id | modules | id | SET NULL |
| assignments | lesson_id | lessons | id | CASCADE |
| user_progress | user_id | auth.users | id | CASCADE |
| user_progress | course_id | courses | id | CASCADE |
| user_progress | lesson_id | lessons | id | CASCADE |
| submissions | user_id | auth.users | id | CASCADE |
| submissions | assignment_id | assignments | id | CASCADE |
| learner_profile | user_id | auth.users | id | CASCADE |
| learner_state | user_id | auth.users | id | CASCADE |
| mentor_memory | user_id | auth.users | id | CASCADE |
| artifacts | user_id | auth.users | id | CASCADE |
| plans | user_id | auth.users | id | CASCADE |
| plans | parent_plan_id | plans | id | SET NULL |
| milestones | plan_id | plans | id | CASCADE |
| milestone_lessons | milestone_id | milestones | id | CASCADE |
| milestone_lessons | lesson_id | lessons | id | CASCADE |
| lesson_feedback | user_id | auth.users | id | CASCADE |
| task_progress | plan_id | plans | id | CASCADE |
| unsupported_goal_log | user_id | auth.users | id | SET NULL |
| milestone_progress | user_id | auth.users | id | CASCADE |
| milestone_progress | plan_id | plans | id | CASCADE |
| goal_history | user_id | auth.users | id | CASCADE |
| goal_history | plan_id | plans | id | SET NULL |
| lesson_chat_messages | user_id | auth.users | id | CASCADE |
| workspace_snapshots | user_id | auth.users | id | CASCADE |
| certificates | user_id | auth.users | id | CASCADE |
| hearing_chat_messages | user_id | auth.users | id | CASCADE |
| mentor_memory_archive | user_id | auth.users | id | CASCADE |
| ai_response_feedback | user_id | auth.users | id | CASCADE |
| email_notification_preferences | user_id | auth.users | id | CASCADE |
| email_notification_log | user_id | auth.users | id | CASCADE |
| exercise_results | user_id | auth.users | id | CASCADE |
| notifications | user_id | auth.users | id | CASCADE |
| notification_preferences | user_id | auth.users | id | CASCADE |

---

## 3. RLS Policies

### 3.1 Public read (no auth required)

| Table | Policy Name | Operation | Condition |
|-------|-------------|-----------|-----------|
| themes | themes_select | SELECT | true |
| courses | courses_select | SELECT | true |
| lessons | lessons_select | SELECT | true |
| assignments | assignments_select | SELECT | true |
| modules | modules_select | SELECT | true |
| certificates | Anyone can verify certificate by id | SELECT | true |

### 3.2 Owner-only (auth.uid() = user_id)

| Table | Policy Name | Operation | Condition |
|-------|-------------|-----------|-----------|
| user_progress | user_progress_select | SELECT | auth.uid() = user_id |
| user_progress | user_progress_insert | INSERT | auth.uid() = user_id |
| user_progress | user_progress_update | UPDATE | auth.uid() = user_id |
| submissions | submissions_select | SELECT | auth.uid() = user_id |
| submissions | submissions_insert | INSERT | auth.uid() = user_id |
| submissions | submissions_update | UPDATE | auth.uid() = user_id |
| learner_profile | learner_profile_select | SELECT | auth.uid() = user_id |
| learner_profile | learner_profile_insert | INSERT | auth.uid() = user_id |
| learner_profile | learner_profile_update | UPDATE | auth.uid() = user_id |
| learner_state | learner_state_select | SELECT | auth.uid() = user_id |
| learner_state | learner_state_insert | INSERT | auth.uid() = user_id |
| learner_state | learner_state_update | UPDATE | auth.uid() = user_id |
| mentor_memory | mentor_memory_select | SELECT | auth.uid() = user_id |
| mentor_memory | mentor_memory_insert | INSERT | auth.uid() = user_id |
| mentor_memory | mentor_memory_update | UPDATE | auth.uid() = user_id |
| artifacts | artifacts_select | SELECT | auth.uid() = user_id |
| artifacts | artifacts_insert | INSERT | auth.uid() = user_id |
| artifacts | artifacts_update | UPDATE | auth.uid() = user_id |
| lesson_feedback | Users can view own feedback | SELECT | auth.uid() = user_id |
| lesson_feedback | Users can insert own feedback | INSERT | auth.uid() = user_id |
| lesson_feedback | Users can update own feedback | UPDATE | auth.uid() = user_id |
| unsupported_goal_log | Users can insert their own... | INSERT | auth.uid() = user_id |
| unsupported_goal_log | Users can read their own... | SELECT | auth.uid() = user_id |
| milestone_progress | milestone_progress_select | SELECT | auth.uid() = user_id |
| milestone_progress | milestone_progress_insert | INSERT | auth.uid() = user_id |
| milestone_progress | milestone_progress_update | UPDATE | auth.uid() = user_id |
| goal_history | Users can view own goal history | SELECT | auth.uid() = user_id |
| goal_history | Users can insert own goal history | INSERT | auth.uid() = user_id |
| goal_history | Users can update own goal history | UPDATE | auth.uid() = user_id |
| lesson_chat_messages | lesson_chat_messages_select | SELECT | auth.uid() = user_id |
| lesson_chat_messages | lesson_chat_messages_insert | INSERT | auth.uid() = user_id |
| lesson_chat_messages | lesson_chat_messages_update | UPDATE | auth.uid() = user_id |
| workspace_snapshots | Users can read own... | SELECT | auth.uid() = user_id |
| workspace_snapshots | Users can insert own... | INSERT | auth.uid() = user_id |
| workspace_snapshots | Users can update own... | UPDATE | auth.uid() = user_id |
| workspace_snapshots | Users can delete own... | DELETE | auth.uid() = user_id |
| certificates | Users can read own certificates | SELECT | auth.uid() = user_id |
| certificates | Users can insert own certificates | INSERT | auth.uid() = user_id |
| certificates | Users can update own certificates | UPDATE | auth.uid() = user_id |
| hearing_chat_messages | hearing_chat_messages_select | SELECT | auth.uid() = user_id |
| hearing_chat_messages | hearing_chat_messages_insert | INSERT | auth.uid() = user_id |
| hearing_chat_messages | hearing_chat_messages_update | UPDATE | auth.uid() = user_id |
| mentor_memory_archive | mentor_memory_archive_select | SELECT | auth.uid() = user_id |
| mentor_memory_archive | mentor_memory_archive_insert | INSERT | auth.uid() = user_id |
| ai_response_feedback | Users can insert own feedback | INSERT | auth.uid() = user_id |
| ai_response_feedback | Users can read own feedback | SELECT | auth.uid() = user_id |
| exercise_results | Users can read own exercise results | SELECT | auth.uid() = user_id |
| exercise_results | Users can insert own exercise results | INSERT | auth.uid() = user_id |

### 3.3 Plan-scoped (via JOIN to plans.user_id)

| Table | Policy Name | Operation | Condition |
|-------|-------------|-----------|-----------|
| plans | plans_select | SELECT | user_id IS NULL OR auth.uid() = user_id |
| plans | plans_insert | INSERT | auth.uid() = user_id |
| plans | plans_update | UPDATE | auth.uid() = user_id |
| milestones | milestones_select | SELECT | via plans: user_id IS NULL OR = auth.uid() |
| milestones | milestones_insert | INSERT | via plans: user_id = auth.uid() |
| milestones | milestones_update | UPDATE | via plans: user_id = auth.uid() |
| milestone_lessons | milestone_lessons_select | SELECT | via milestones -> plans: user_id IS NULL OR = auth.uid() |
| milestone_lessons | milestone_lessons_insert | INSERT | via milestones -> plans: user_id = auth.uid() |
| milestone_lessons | milestone_lessons_update | UPDATE | via milestones -> plans: user_id = auth.uid() |
| task_progress | task_progress_select | SELECT | via plans: user_id IS NULL OR = auth.uid() |
| task_progress | task_progress_insert | INSERT | via plans: user_id = auth.uid() |
| task_progress | task_progress_update | UPDATE | via plans: user_id = auth.uid() |
| task_progress | task_progress_delete | DELETE | via plans: user_id = auth.uid() |

### 3.4 FOR ALL policies

| Table | Policy Name | Operation | Condition |
|-------|-------------|-----------|-----------|
| email_notification_preferences | Users manage own email prefs | ALL | auth.uid() = user_id |
| notification_preferences | Users manage own notification prefs | ALL | auth.uid() = user_id |

### 3.5 Service-role insert policies

| Table | Policy Name | Operation | Condition |
|-------|-------------|-----------|-----------|
| email_notification_log | Service can insert email log | INSERT | true |
| notifications | Service can insert notifications | INSERT | true |

### 3.6 Notification-specific policies

| Table | Policy Name | Operation | Condition |
|-------|-------------|-----------|-----------|
| email_notification_log | Users read own email log | SELECT | auth.uid() = user_id |
| notifications | Users read own notifications | SELECT | auth.uid() = user_id |
| notifications | Users update own notifications | UPDATE | auth.uid() = user_id |
| notifications | Users delete own notifications | DELETE | auth.uid() = user_id |

---

## 4. Triggers and Functions

### 4.1 `update_modules_updated_at()` (020)

```sql
CREATE OR REPLACE FUNCTION update_modules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 4.2 Trigger: `modules_updated_at` (020)

```sql
CREATE TRIGGER modules_updated_at
  BEFORE UPDATE ON modules
  FOR EACH ROW
  EXECUTE FUNCTION update_modules_updated_at();
```

Note: This is the only trigger/function pair in the schema. Other tables with `updated_at` columns do NOT have automatic update triggers -- the application layer is responsible for setting them.

---

## 5. Indexes

| Index Name | Table | Columns / Expression | Type | Migration |
|---|---|---|---|---|
| idx_courses_theme_id | courses | theme_id | btree | 001 |
| idx_courses_order_index | courses | order_index | btree | 001 |
| idx_lessons_course_id | lessons | course_id | btree | 001 |
| idx_lessons_order_index | lessons | order_index | btree | 001 |
| idx_lessons_module_id | lessons | module_id | btree | 020 |
| idx_lessons_content_types | lessons | content_types | GIN | 021 |
| idx_lessons_track_id | lessons | track_id | btree | 024 |
| idx_lessons_tags | lessons | tags | GIN | 024 |
| idx_assignments_lesson_id | assignments | lesson_id | btree | 001 |
| idx_assignments_due_date | assignments | due_date | btree | 001 |
| idx_user_progress_user_id | user_progress | user_id | btree | 001 |
| idx_user_progress_lesson_id | user_progress | lesson_id | btree | 001 |
| idx_submissions_user_id | submissions | user_id | btree | 001 |
| idx_submissions_assignment_id | submissions | assignment_id | btree | 001 |
| idx_mentor_memory_user_id_created_at | mentor_memory | (user_id, created_at DESC) | btree | 002 |
| idx_artifacts_user_id_created_at | artifacts | (user_id, created_at DESC) | btree | 004 |
| idx_artifacts_user_id_milestone_step | artifacts | (user_id, milestone_id, step_id, created_at DESC) | btree | 004 |
| idx_plans_user_id | plans | user_id | btree | 005 |
| idx_plans_is_active | plans | is_active | btree | 005 |
| idx_plans_parent_plan_id | plans | parent_plan_id | btree | 015 |
| idx_plans_user_version | plans | (user_id, version) | btree | 015 |
| idx_milestones_plan_id_order | milestones | (plan_id, order_index) | btree | 005 |
| idx_milestone_lessons_milestone_id_order | milestone_lessons | (milestone_id, order_index) | btree | 005 |
| idx_milestone_lessons_lesson_id | milestone_lessons | lesson_id | btree | 005 |
| idx_task_progress_plan_id | task_progress | plan_id | btree | 008 |
| idx_task_progress_plan_task | task_progress | (plan_id, task_id) | btree | 008 |
| idx_unsupported_goal_log_created | unsupported_goal_log | (created_at DESC) | btree | 009 |
| idx_unsupported_goal_log_normalized | unsupported_goal_log | normalized_goal | btree | 009 |
| idx_milestone_progress_user_plan | milestone_progress | (user_id, plan_id) | btree | 010 |
| idx_goal_history_user_id | goal_history | (user_id, started_at DESC) | btree | 011 |
| idx_lesson_chat_messages_user_lesson | lesson_chat_messages | (user_id, lesson_id) | btree | 012 |
| idx_lesson_chat_messages_user_updated | lesson_chat_messages | (user_id, updated_at DESC) | btree | 012 |
| idx_workspace_snapshots_user_id | workspace_snapshots | user_id | btree | 013 |
| idx_certificates_user_id | certificates | user_id | btree | 014 |
| idx_hearing_chat_messages_user_goal | hearing_chat_messages | (user_id, goal) | btree | 016 |
| idx_hearing_chat_messages_user_updated | hearing_chat_messages | (user_id, updated_at DESC) | btree | 016 |
| idx_mentor_memory_archive_user | mentor_memory_archive | (user_id, archived_at DESC) | btree | 017 |
| idx_mentor_memory_archive_compaction | mentor_memory_archive | compaction_id | btree | 017 |
| idx_ai_response_feedback_user_negative | ai_response_feedback | (user_id, rating, created_at DESC) WHERE rating = 'negative' | partial btree | 018 |
| idx_ai_response_feedback_context | ai_response_feedback | (user_id, chat_context, context_id) | btree | 018 |
| idx_modules_track_id | modules | track_id | btree | 020 |
| idx_modules_sort_order | modules | sort_order | btree | 020 |
| idx_email_log_user_sent | email_notification_log | (user_id, sent_at DESC) | btree | 023 |
| idx_exercise_results_user_lesson | exercise_results | (user_id, lesson_id) | btree | 025 |
| idx_exercise_results_exercise | exercise_results | (user_id, exercise_id) | btree | 025 |
| idx_notifications_user_created | notifications | (user_id, created_at DESC) | btree | 026 |
| idx_notifications_user_unread | notifications | (user_id, read) WHERE read = false | partial btree | 026 |

---

## 6. Check Constraints and Custom Types

No custom PostgreSQL `CREATE TYPE` or `CREATE DOMAIN` statements exist. All type restrictions are implemented via inline `CHECK` constraints.

### Summary of CHECK constraints

| Table | Column | Allowed Values |
|---|---|---|
| courses | difficulty | beginner, intermediate, advanced |
| learner_state | skill_level | beginner, intermediate, advanced |
| learner_state | preferred_pace | relaxed, steady, intensive |
| learner_profile | cli_familiarity | none, basic, comfortable (or NULL) |
| artifacts | artifact_type | url, text, note |
| mentor_memory | source | planner, mentor, system |
| mentor_memory_archive | source | planner, mentor, system |
| task_progress | status | not-started, in-progress, completed, on-hold, blocked, skipped |
| milestone_progress | status | in-progress, completed |
| goal_history | status | active, archived, completed |
| lesson_feedback | difficulty_rating | 1..5 |
| lesson_feedback | clarity_rating | 1..5 |
| submissions | grade | 0..100 |
| ai_response_feedback | chat_context | lesson, hearing, mentor |
| ai_response_feedback | rating | positive, negative |
| ai_response_feedback | reason | off_topic, already_known, unclear, too_simple, too_complex, repetitive, other |
| modules | status | active, draft, archived |
| email_notification_preferences | frequency | daily, weekly, never |
| email_notification_log | email_type | streak_reminder, milestone, graduation |
| lessons | difficulty_level | beginner, intermediate, advanced |
| notifications | type | milestone_reached, streak_update, lesson_recommendation, plan_revision, artifact_verified |

---

## 7. Relationship Diagram

```
auth.users
 |
 |-- 1:1 -- learner_profile
 |-- 1:1 -- learner_state
 |-- 1:1 -- email_notification_preferences
 |-- 1:1 -- notification_preferences
 |
 |-- 1:N -- mentor_memory
 |-- 1:N -- mentor_memory_archive
 |-- 1:N -- artifacts
 |-- 1:N -- plans ──────────────────────┐
 |-- 1:N -- goal_history ──> plans      |
 |-- 1:N -- milestone_progress ──> plans|
 |-- 1:N -- user_progress               |
 |-- 1:N -- submissions                 |
 |-- 1:N -- lesson_feedback             |
 |-- 1:N -- lesson_chat_messages        |
 |-- 1:N -- hearing_chat_messages       |
 |-- 1:N -- workspace_snapshots         |
 |-- 1:N -- certificates                |
 |-- 1:N -- ai_response_feedback        |
 |-- 1:N -- exercise_results            |
 |-- 1:N -- notifications               |
 |-- 1:N -- email_notification_log      |
 |-- 1:N -- unsupported_goal_log        |
 |
 themes
  \-- 1:N -- courses
               \-- 1:N -- lessons ─────────────────────────┐
                           |   \-- 1:N -- assignments       |
                           |                \-- submissions  |
                           |                                 |
                           +-- FK module_id --> modules      |
                                                             |
 plans (self-ref: parent_plan_id)                            |
  |-- 1:N -- milestones                                      |
  |            \-- 1:N -- milestone_lessons ──> lessons ------+
  |-- 1:N -- task_progress                                   |
  |-- 1:N -- milestone_progress                              |
  \-- referenced by goal_history.plan_id                     |
                                                             |
 modules                                                     |
  \-- referenced by lessons.module_id ------- lessons -------+
                                                             |
 user_progress ──> courses                                   |
 user_progress ──> lessons ----------------------------------+
```

### Detailed Entity Relationship (text ERD)

```
┌──────────────────┐       ┌──────────────────┐
│    auth.users     │       │     themes        │
│  (Supabase Auth)  │       │                  │
└────────┬─────────┘       └────────┬─────────┘
         │                          │
         │ 1:1                      │ 1:N
         ▼                          ▼
┌──────────────────┐       ┌──────────────────┐
│ learner_profile   │       │    courses        │
│ learner_state     │       │                  │
│ email_notif_prefs │       └────────┬─────────┘
│ notif_preferences │                │ 1:N
└──────────────────┘                ▼
         │               ┌──────────────────┐       ┌──────────────┐
         │ 1:N            │    lessons        │◄──────│   modules    │
         │               │  +module_id(FK)   │       │              │
         ▼               │  +track_id        │       └──────────────┘
┌──────────────────┐     │  +content_types   │
│  mentor_memory    │     │  +tags (GIN)      │
│  mentor_memory_   │     └───────┬──────────┘
│    archive        │             │
└──────────────────┘             │ 1:N
                                 ▼
         ┌──────────────────────────────────────┐
         │           assignments                 │
         │             │                         │
         │             │ 1:N                     │
         │             ▼                         │
         │         submissions                   │
         └──────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────┐
│     plans         │◄────│  goal_history     │
│  +version         │     └──────────────────┘
│  +parent_plan_id──┤(self-ref)
│                  │
└───────┬──────────┘
        │ 1:N
        ├──────────────────────────┐
        ▼                          ▼
┌──────────────────┐     ┌──────────────────┐
│   milestones      │     │  task_progress    │
└───────┬──────────┘     └──────────────────┘
        │ 1:N
        ▼
┌──────────────────┐
│ milestone_lessons │──────► lessons
└──────────────────┘

┌──────────────────┐     ┌──────────────────┐
│milestone_progress │     │   certificates    │
│  -> plans         │     │  (standalone)     │
│  -> auth.users    │     └──────────────────┘
└──────────────────┘

Standalone user-scoped tables (all FK to auth.users):
  - artifacts
  - lesson_feedback
  - lesson_chat_messages
  - hearing_chat_messages
  - workspace_snapshots
  - ai_response_feedback
  - exercise_results
  - notifications
  - email_notification_log
  - unsupported_goal_log
  - user_progress (also FK to courses, lessons)
```

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total tables | 30 |
| Migration files | 26 (001-026) |
| Foreign keys | 36 |
| RLS policies | ~75 |
| Indexes | 47 |
| Triggers | 1 (modules_updated_at) |
| Functions | 1 (update_modules_updated_at) |
| Custom types/enums | 0 (all inline CHECK) |
| Seed files | 1 (apps/web/supabase/seed.sql) |
