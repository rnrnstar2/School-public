# Repository Inventory - School Monorepo

Generated: 2026-04-04

---

## 1. Top-Level Directory Structure

### apps/ (2 apps)

| Directory | Description |
|-----------|-------------|
| `apps/web/` | Next.js メインWebアプリ (Supabase, Sentry, PostHog, Playwright) |
| `apps/admin/` | 管理画面アプリ (Next.js) |

### packages/ (0 packages)

`packages/` ディレクトリは存在するが、中身は空。共有パッケージは未作成。

### supabase/ (root-level)

`supabase/` ディレクトリはルートに存在するが、`.temp/` のみ含まれる。マイグレーションなし。  
実際のSupabase設定・マイグレーションは `apps/web/supabase/` 配下に格納。

---

## 2. API Route Files (45 files)

すべて `apps/web/src/app/api/` 配下の `route.ts`。

| # | Path (relative to apps/web/src/app/api/) |
|---|------------------------------------------|
| 1 | `analytics/funnel/route.ts` |
| 2 | `analytics/learner/route.ts` |
| 3 | `artifacts/route.ts` |
| 4 | `artifacts/verify/route.ts` |
| 5 | `certificate/[id]/route.ts` |
| 6 | `certificate/route.ts` |
| 7 | `certificate/share/route.ts` |
| 8 | `exercises/results/route.ts` |
| 9 | `feedback/ai-response/route.ts` |
| 10 | `health/route.ts` |
| 11 | `learner/mentor-memory/route.ts` |
| 12 | `learner/resume/route.ts` |
| 13 | `learner/state-feedback/route.ts` |
| 14 | `lessons/[id]/chat/history/route.ts` |
| 15 | `lessons/[id]/chat/route.ts` |
| 16 | `lessons/[id]/chat/summary/route.ts` |
| 17 | `lessons/[id]/complete/route.ts` |
| 18 | `lessons/[id]/context-bridge/route.ts` |
| 19 | `lessons/[id]/feedback/route.ts` |
| 20 | `lessons/[id]/next-flow/route.ts` |
| 21 | `lessons/[id]/recommend-next/route.ts` |
| 22 | `mentor/actions/route.ts` |
| 23 | `notifications/email-preferences/route.ts` |
| 24 | `notifications/in-app/preferences/route.ts` |
| 25 | `notifications/in-app/route.ts` |
| 26 | `notifications/send-celebration/route.ts` |
| 27 | `notifications/send-reminder/route.ts` |
| 28 | `planner/goal-history/route.ts` |
| 29 | `planner/graduation/route.ts` |
| 30 | `planner/hearing/history/route.ts` |
| 31 | `planner/hearing/route.ts` |
| 32 | `planner/hearing/unfinished/route.ts` |
| 33 | `planner/mentor-chat/route.ts` |
| 34 | `planner/multi-track/route.ts` |
| 35 | `planner/next-goals/route.ts` |
| 36 | `planner/plan-history/route.ts` |
| 37 | `planner/plan-review/route.ts` |
| 38 | `planner/plan-revision/route.ts` |
| 39 | `planner/recommendation/route.ts` |
| 40 | `planner/task-progress/route.ts` |
| 41 | `planner/unsupported-goals/route.ts` |
| 42 | `smoke/route.ts` |
| 43 | `user/delete/route.ts` |
| 44 | `user/export/route.ts` |
| 45 | `vitals/route.ts` |

---

## 3. UI Component Files (80 files total)

すべて `apps/web/src/components/` 配下。テストファイル (`.test.tsx`) を含む。

### Subdirectory Breakdown

| Subdirectory | Files | File List |
|-------------|-------|-----------|
| `analytics/` | 2 | `posthog-provider.tsx`, `web-vitals.tsx` |
| `auth/` | 4 | `auth-placeholder-page.tsx`, `login-form.tsx`, `preview-mode-badge.tsx`, `signup-form.tsx` |
| `certificate/` | 1 | `certificate-pdf.tsx` |
| `chat/` | 4 | `ai-response-feedback.tsx`, `mentor-action-card.tsx`, `mentor-chat-sidebar.tsx`, `streaming-message-bubble.tsx` (+1 test) |
| `lesson/` | 10 | `code-playground.tsx`, `contextual-bridge-card.tsx`, `lesson-ai-chat.tsx`, `lesson-complete-button.tsx`, `lesson-content-renderer.tsx`, `lesson-enhancements.ts`, `lesson-feedback-form.tsx`, `lessons-browser.tsx`, `lessons-browser-skeleton.tsx`, `next-lesson-flow.tsx`, `video-player.tsx` (+2 tests) |
| `mentor/` | 17 | `cross-track-skill-map.tsx`, `cross-track-timeline.tsx`, `goal-history-panel.tsx`, `graduation-panel.tsx`, `hearing-history-panel.tsx`, `learner-analytics-panel.tsx`, `learner-insight-panel.tsx`, `learning-journey-view.tsx`, `mentor-memory-panel.tsx`, `mentor-workspace-skeleton.tsx`, `mentor-workspace-view.tsx`, `next-steps-section.tsx`, `plan-display.tsx`, `progress-summary-panel.tsx`, `task-card.tsx`, `track-progress-cards.tsx`, `unfinished-hearing-banner.tsx`, `welcome-back-card.tsx` (+2 tests) |
| `navigation/` | 2 | `header.tsx`, `notification-center.tsx` (+1 test) |
| `onboarding/` | 1 | `onboarding-tour.tsx` (+1 test) |
| `plan/` | 1 | `PlanDisplay.tsx` |
| `planner/` | 12 | `ai-tool-recommendation.tsx`, `artifact-panel.tsx`, `focused-plan-view.tsx`, `hearing-skeleton.tsx`, `homepage-entry.tsx`, `plan-history-drawer.tsx`, `plan-review-panel.tsx`, `planner-chat-interview.tsx`, `planner-dashboard.tsx`, `planner-dashboard-skeleton.tsx`, `planner-mentor-space.tsx`, `task-card.tsx`, `tool-selection-view.tsx` (+2 tests) |
| `share/` | 2 | `share-buttons.tsx`, `share-card-view.tsx` |
| `theme/` | 1 | `theme-provider.tsx` |
| `ui/` | 9 | `ai-error-banner.tsx`, `ai-error-boundary.tsx`, `button.tsx`, `card.tsx`, `markdown-renderer.tsx`, `mock-adapter-badge.tsx`, `motion-toggle.tsx`, `offline-banner.tsx`, `skeleton.tsx`, `theme-toggle.tsx` (+1 test) |

---

## 4. Test Files (27 files, excluding .claude/worktrees/)

### Unit / Integration Tests (.test.ts / .test.tsx) - 21 files

**Component Tests (10):**

| File |
|------|
| `apps/web/src/components/chat/streaming-message-bubble.test.tsx` |
| `apps/web/src/components/lesson/code-playground.test.tsx` |
| `apps/web/src/components/lesson/lessons-browser.test.tsx` |
| `apps/web/src/components/mentor/mentor-workspace-view.test.tsx` |
| `apps/web/src/components/mentor/task-card.test.tsx` |
| `apps/web/src/components/navigation/notification-center.test.tsx` |
| `apps/web/src/components/onboarding/onboarding-tour.test.tsx` |
| `apps/web/src/components/planner/planner-chat-interview.test.tsx` |
| `apps/web/src/components/planner/tool-selection-view.test.tsx` |
| `apps/web/src/components/ui/mock-adapter-badge.test.tsx` |

**Library / API Tests (11):**

| File |
|------|
| `apps/web/src/app/api/api-routes.test.ts` |
| `apps/web/src/lib/ai/conversation-context.test.ts` |
| `apps/web/src/lib/curriculum/lesson-content.test.ts` |
| `apps/web/src/lib/curriculum/lesson-library.test.ts` |
| `apps/web/src/lib/curriculum/track-extensibility.test.ts` |
| `apps/web/src/lib/feedback/feedback.test.ts` |
| `apps/web/src/lib/lesson-completion.test.ts` |
| `apps/web/src/lib/mentor-memory-compaction.test.ts` |
| `apps/web/src/lib/planner/graduation.test.ts` |
| `apps/web/src/lib/planner/hearing.test.ts` |
| `apps/web/src/lib/planner/json-stream.test.ts` |
| `apps/web/src/lib/planner/live-hearing-service.test.ts` |
| `apps/web/src/lib/planner/server.test.ts` |
| `apps/web/src/lib/planner/zai.test.ts` |
| `apps/web/src/lib/supabase/query-fallback.test.ts` |

### E2E Tests (.spec.ts) - 6 files

| File |
|------|
| `apps/web/e2e/accessibility.spec.ts` |
| `apps/web/e2e/core-flow.spec.ts` |
| `apps/web/e2e/four-tracks.spec.ts` |
| `apps/web/e2e/mvp-acceptance.spec.ts` |
| `apps/web/e2e/notification-onboarding.spec.ts` |
| `apps/web/e2e/streaming-chat.spec.ts` |

---

## 5. Supabase Migration Files (27 files)

すべて `apps/web/supabase/migrations/` 配下。`supabase/migrations/` (ルート) にはファイルなし。

| # | File |
|---|------|
| 1 | `001_initial_schema.sql` |
| 2 | `002_learner_base_models.sql` |
| 3 | `003_ai_mentor_hearing_fields.sql` |
| 4 | `004_planner_artifacts.sql` |
| 5 | `005_learning_plans.sql` |
| 6 | `006_artifacts_task_api_compat.sql` |
| 7 | `007_lesson_feedback.sql` |
| 8 | `008_task_progress.sql` |
| 9 | `009_unsupported_goal_log.sql` |
| 10 | `010_milestone_progress.sql` |
| 11 | `011_goal_history.sql` |
| 12 | `012_lesson_chat_messages.sql` |
| 13 | `013_workspace_snapshots.sql` |
| 14 | `014_certificates.sql` |
| 15 | `015_plan_versioning.sql` |
| 16 | `016_hearing_chat_messages.sql` |
| 17 | `017_mentor_memory_archive.sql` |
| 18 | `018_ai_response_feedback.sql` |
| 19 | `019_task_progress_time_tracking.sql` |
| 20 | `020_modules_table.sql` |
| 21 | `021_lesson_content_types.sql` |
| 22 | `022_certificate_sharing.sql` |
| 23 | `023_email_notification_preferences.sql` |
| 24 | `024_lesson_curriculum_fields.sql` |
| 25 | `025_exercise_results.sql` |
| 26 | `026_notifications.sql` |
| 27 | `pending_migrations_combined.sql` (未適用) |

---

## 6. Root Config Files

| File | Purpose |
|------|---------|
| `package.json` | Monorepo root (Turborepo, pnpm workspaces) |
| `pnpm-workspace.yaml` | Workspace定義: `apps/*`, `packages/*` |
| `.gitignore` | Git除外設定 |
| `.env.example` | 環境変数テンプレート |
| `.env.local` | ローカル環境変数 (gitignore対象) |
| `.vercelignore` | Vercelデプロイ除外設定 |
| `CLAUDE.md` | Claude Code プロジェクト設定 |
| `README.md` | プロジェクトREADME |
| `TASK_QUEUE.md` | タスクキュー (アクティブ) |
| `TASK_QUEUE_ARCHIVE.md` | タスクキュー (アーカイブ) |
| `TASKS.md` | タスク一覧 |
| `CURRENT_MISSION.md` | 現在のミッション定義 |
| `DEPLOY_VERIFICATION.md` | デプロイ検証チェックリスト |
| `MEMORY.md` | プロジェクトメモリ |

### apps/web/ Config Files

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js設定 |
| `tsconfig.json` | TypeScript設定 |
| `eslint.config.mjs` | ESLint設定 |
| `postcss.config.mjs` | PostCSS設定 |
| `package.json` | Webアプリ依存関係 |
| `playwright.config.ts` | Playwright E2E設定 |
| `vitest.config.ts` | Vitest単体テスト設定 |
| `components.json` | shadcn/ui設定 |
| `middleware.ts` | Next.js Middleware (Auth session refresh) |
| `sentry.client.config.ts` | Sentry クライアント設定 |
| `sentry.server.config.ts` | Sentry サーバー設定 |
| `sentry.edge.config.ts` | Sentry Edge設定 |
| `vercel.json` | Vercelデプロイ設定 |

### apps/admin/ Config Files

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js設定 |
| `tsconfig.json` | TypeScript設定 |
| `eslint.config.mjs` | ESLint設定 |
| `postcss.config.mjs` | PostCSS設定 |
| `package.json` | Adminアプリ依存関係 |
| `middleware.ts` | Next.js Middleware |

---

## 7. Shared Packages Structure

### Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

**現状: `packages/` ディレクトリは空。** 共有パッケージは未作成。

apps/web と apps/admin は独立した Next.js アプリとして構成されており、共有コード（型定義、ユーティリティなど）は `packages/` に切り出されていない。Turborepo で並列ビルド・dev を管理。

---

## Summary

| Category | Count |
|----------|-------|
| Apps | 2 (`web`, `admin`) |
| Shared Packages | 0 |
| API Routes | 45 |
| UI Components (files) | 80 |
| Component Subdirectories | 13 |
| Unit/Integration Tests | 21 |
| E2E Tests | 6 |
| Total Test Files | 27 |
| Supabase Migrations | 27 (26 applied + 1 pending) |
| Root Config Files | 14 |
| apps/web Config Files | 13 |
| src/lib Modules | 12 (`ai`, `analytics`, `api`, `curriculum`, `email`, `feedback`, `mentor`, `notifications`, `observability`, `planner`, `supabase`, `theme`) |
