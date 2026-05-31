# Analytics / Observability Inventory

> Generated: 2026-04-04
> Last updated: 2026-04-16 (TQ-120)

---

## 1. PostHog

### SDK Setup

| Item | Detail |
|------|--------|
| Package | `posthog-js` (client), HTTP API (server) |
| Init file | `apps/web/src/lib/analytics/posthog.ts` |
| Provider | `apps/web/src/components/analytics/posthog-provider.tsx` |
| Mounted in | `apps/web/src/app/layout.tsx` (root layout) |
| Env vars | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` |
| Auto pageview | Disabled (`capture_pageview: false`); manual `$pageview` via `PostHogPageView` on route change |
| Page leave | Enabled (`capture_pageleave: true`) |
| Session recording | Disabled (`disable_session_recording: true`) |
| DNT | Respected (`respect_dnt: true`) |
| Persistence | `localStorage+cookie` |
| Server capture | `apps/web/src/lib/analytics/server.ts` -- fire-and-forget `fetch` to `/capture/` |

### Event Helpers

Defined in `apps/web/src/lib/analytics/events.ts`, re-exported from `apps/web/src/lib/analytics/index.ts`.

| Helper function | Event name | Properties | Client/Server |
|----------------|------------|------------|---------------|
| `trackGoalInput(goal)` | `goal_input` | `{ goal }` (truncated 200 chars) | Client |
| `trackHearingComplete(goal, questionCount)` | `hearing_complete` | `{ goal, question_count }` | Client |
| `trackPlanGenerated(goal, stepCount)` | `plan_generated` | `{ goal, step_count }` | Client |
| `trackTaskCompleted(taskId, status)` | `task_completed` | `{ task_id, status }` | Client |
| `trackLessonCompleted(lessonId)` | `lesson_completed` | `{ lesson_id }` | Client |
| `trackArtifactSubmitted(artifactType, milestoneId)` | `artifact_submitted` | `{ artifact_type, milestone_id }` | Client |
| `trackGraduationReached(planId, graduated)` | `graduation_reached` | `{ plan_id, graduated }` | Client |
| `trackWebVital(name, value, rating)` | `web_vital` | `{ metric, value, rating }` | Client |
| `trackShareCardShared(certificateId, target)` | `share_card_shared` | `{ certificate_id, target }` | Client |
| `identifyUser(userId)` | (PostHog identify) | `{ user_id }` (no traits) | Client |
| `resetUser()` | (PostHog reset) | -- | Client |

---

## 2. All Tracked Events (with call sites)

### Client-side events

| Event | Call site | Properties |
|-------|-----------|------------|
| `$pageview` | `PostHogPageView` (`posthog-provider.tsx`) on every route change | `{ $current_url }` |
| `goal_input` | `planner-dashboard.tsx:1684` | `{ goal }` |
| `hearing_complete` | `planner-dashboard.tsx:1482` | `{ goal, question_count }` |
| `plan_generated` | `planner-dashboard.tsx:1308` | `{ goal, step_count }` |
| `web_vital` | `web-vitals.tsx:20` via `useReportWebVitals` | `{ metric, value, rating }` |
| `share_card_shared` | `share-buttons.tsx:72` | `{ certificate_id, target }` |
| `lesson_started` (TQ-120) | `LessonStartedTracker` in `atom-detail-view.tsx`, mounted on `/lessons/[id]` | `{ lesson_id, lesson_title, track_id, from_recommendation }` |
| `blocked` (TQ-120) | `BlockedClickTracker` in `app/layout.tsx` — document capture phase click listener | `{ target_testid, path, reason, tag }` |
| `evidence_passed` (TQ-120, client) | `trackEvidencePassedFromClient` helper (UI wire-up pending) | `{ artifact_id, milestone_id }` |
| `plan_revised` (TQ-120, client) | `trackPlanRevisedFromClient` helper (UI wire-up pending) | `{ plan_id, revision_number, reason }` (reason is bucket, not free text) |

### Server-side events (via `captureServerEvent`)

| Event | API route | Properties |
|-------|-----------|------------|
| `hearing_complete` | `POST /api/planner/hearing` (on `result.completed`) | `{ goal, question_count }` |
| `plan_generated` | `POST /api/planner/recommendation` (after persist) | `{ goal, step_count, status }` |
| `task_completed` | `POST /api/planner/task-progress` (when `status === 'completed'`) | `{ task_id, status, elapsed_minutes }` |
| `lesson_completed` | `POST /api/lessons/[id]/complete` | `{ lesson_id }` |
| `artifact_submitted` | `POST /api/artifacts` | `{ artifact_type, milestone_id }` |
| `graduation_reached` | `POST /api/planner/graduation` | `{ plan_id, graduated, track_id }` |
| `certificate_issued` | `POST /api/certificate` | `{ certificate_id, plan_id, track_id }` |

### Dual-tracked events

The following events fire from **both** client and server, creating potential double-counting:

- `hearing_complete` -- client in `planner-dashboard.tsx`, server in `/api/planner/hearing`
- `plan_generated` -- client in `planner-dashboard.tsx`, server in `/api/planner/recommendation`

### Events with NO call site (defined but never invoked)

| Helper | Event name | Status |
|--------|-----------|--------|
| `trackTaskCompleted` | `task_completed` | **Client helper defined, never called from UI** (only server-side) |
| `trackLessonCompleted` | `lesson_completed` | **Client helper defined, never called from UI** (only server-side) |
| `trackArtifactSubmitted` | `artifact_submitted` | **Client helper defined, never called from UI** (only server-side) |
| `trackGraduationReached` | `graduation_reached` | **Client helper defined, never called from UI** (only server-side) |
| ~~`identifyUser`~~ | (identify) | RESOLVED (TQ-121): wired into `useAnalyticsIdentify` → `onAuthStateChange`. Identify payload is `user_id` only. |
| ~~`resetUser`~~ | (reset) | RESOLVED (TQ-121): fires on `SIGNED_OUT`. |

---

## 3. Sentry

### SDK Configuration

| Runtime | Config file | `tracesSampleRate` |
|---------|------------|-------------------|
| Client | `apps/web/sentry.client.config.ts` | 0.2 (20%) |
| Server | `apps/web/sentry.server.config.ts` | 0.5 (50%) |
| Edge | `apps/web/sentry.edge.config.ts` | 0.5 (50%) |

- DSN from `NEXT_PUBLIC_SENTRY_DSN`
- Environment from `NEXT_PUBLIC_VERCEL_ENV`
- Session replay: disabled (both sample rates = 0)
- Instrumentation: `apps/web/src/instrumentation.ts` -- imports server/edge configs, exports `onRequestError = Sentry.captureRequestError`
- Next.js integration: `withSentryConfig()` in `apps/web/next.config.ts`, events proxied through `/monitoring`

### Error Capture Points

| Location | Method | Context |
|----------|--------|---------|
| `global-error.tsx` | `Sentry.captureException(error)` | Root error boundary, catches unhandled render errors |
| `ai-error-boundary.tsx` | `Sentry.captureException(error, { tags: { flow }, contexts: { react } })` | AI flow error boundary with component stack |
| `ai-metrics.ts` | `Sentry.captureException(error, { tags: { operation, request_id } })` | Wraps all AI API calls |
| `middleware.ts` | `Sentry.setTag('request_id', ...)` / `Sentry.setTag('path', ...)` | Tags every request with X-Request-Id + path |

### Custom Metrics (Sentry `metrics.*`)

| Metric | Type | Source | Attributes |
|--------|------|--------|------------|
| `ai.latency` | distribution (ms) | `ai-metrics.ts` | `{ operation }` |
| `ai.call.success` | counter | `ai-metrics.ts` | `{ operation }` |
| `ai.call.failure` | counter | `ai-metrics.ts` | `{ operation }` |
| `ai.retry.attempt` | counter | `fetch-with-retry.ts` | `{ operation, attempt, reason }` |
| `ai.retry.recovered` | counter | `fetch-with-retry.ts` | `{ operation, attempt }` |
| `ai.retry.exhausted` | counter | `fetch-with-retry.ts` | `{ operation, total_attempts, reason }` |

### AI Operations Instrumented

All 6 AI call sites are wrapped with `withAiMetrics`:

| Operation tag | API route |
|--------------|-----------|
| `ai.hearing` | `POST /api/planner/hearing` |
| `ai.recommendation` | `POST /api/planner/recommendation` |
| `ai.mentor-chat` | `POST /api/planner/mentor-chat` |
| `ai.plan-review` | `POST /api/planner/plan-review` |
| `ai.lesson-chat` | `POST /api/lessons/[id]/chat` |
| `ai.context-bridge` | `POST /api/lessons/[id]/context-bridge` |

---

## 4. Web Vitals

| Item | Detail |
|------|--------|
| Component | `apps/web/src/components/analytics/web-vitals.tsx` |
| Mounted in | Root layout (`layout.tsx`) |
| Hook | `useReportWebVitals` from `next/web-vitals` |
| Metrics collected | CLS, FID, FCP, LCP, TTFB |
| Destinations | 1) Console (dev only), 2) PostHog (`web_vital` event), 3) `POST /api/vitals` via `navigator.sendBeacon` |
| Server endpoint | `apps/web/src/app/api/vitals/route.ts` |

---

## 5. Funnel Dashboard

`GET /api/analytics/funnel` (`apps/web/src/app/api/analytics/funnel/route.ts`) builds a server-side funnel from DB tables, independent of PostHog:

| Stage | DB source |
|-------|-----------|
| goal_input | `goal_history` count |
| hearing_complete | `planner_hearings` count |
| plan_generated | `planner_plans` count |
| task_completed | `task_progress` where status=completed |
| lesson_completed | `user_progress` where completed=true |
| artifact_submitted | `artifacts` count |
| graduation_reached | hardcoded 0 (no persistence) |

Analytics dashboard page: `apps/web/src/app/(app)/analytics/page.tsx`

---

## 6. Gap Analysis: Missing Events for Core Funnel

The ideal funnel stages vs. current tracking status (post-TQ-120):

| Ideal funnel stage | Tracked? | Notes |
|-------------------|----------|-------|
| `goal_created` | PARTIAL | Tracked as `goal_input` (client + DB via goal_history). Name mismatch only. |
| `plan_compiled` | YES | Tracked as `plan_generated` (client + server dual). Name mismatch only. |
| `lesson_started` | YES (TQ-120) | Client-side via `LessonStartedTracker` on `/lessons/[id]`; server-side via `/api/lessons/[id]/start` when invoked. Session-level dedupe (1 event per `lesson_id` per tab). |
| `lesson_completed` | YES | Server-side only via `/api/lessons/[id]/complete`. |
| `stuck_reported` | YES (server) / `blocked` added (TQ-120) | Server-side via `/api/planner/task-progress` when status=blocked. **New:** `blocked` event (passive UI signal) captured via `BlockedClickTracker`. |
| `artifact_submitted` | YES | Server-side via `/api/artifacts`. |
| `evidence_passed` | YES (TQ-120) | Server-side via `/api/artifacts/verify` + `/api/lessons/[id]/complete` when artifact provided; client helper `trackEvidencePassedFromClient` available for future UI wiring. Payload stripped of `content` / `goal` / `revision_summary` via `lib/analytics/safe-properties.ts`. |
| `plan_revised` | YES (TQ-120) | Server-side via `/api/planner/plan-revision`; now emits `revision_number` + `reason_bucket` (free-text `revision_summary` stripped at the sanitiser layer). Client helper `trackPlanRevisedFromClient` available. |
| `graduated` | YES | Tracked as `graduation_reached` (server-side). |

### Additional Gaps

| Gap | Severity | Recommendation |
|-----|----------|----------------|
| ~~`identifyUser` never called~~ | RESOLVED (TQ-121) | `useAnalyticsIdentify` subscribes to Supabase `onAuthStateChange` and fires `identifyUser(session.user.id)` on `INITIAL_SESSION` / `SIGNED_IN` / `TOKEN_REFRESHED` / `USER_UPDATED`. Identify payload is `user_id` only — no email / created_at per CURRENT_MISSION §31. |
| ~~`resetUser` never called~~ | RESOLVED (TQ-121) | Same hook calls `resetUser()` on `SIGNED_OUT`, preventing event leakage across users on shared devices. |
| ~~`lesson_started` not tracked~~ | RESOLVED (TQ-120) | Client-side `LessonStartedTracker` fires once per lesson per session. See `apps/web/src/components/analytics/lesson-started-tracker.tsx`. |
| ~~`stuck_reported` not tracked~~ | RESOLVED | Server emits via `/api/planner/task-progress` (`body.status === 'blocked'`). TQ-120 also adds the passive `blocked` UI signal for disabled-button clicks. |
| ~~`evidence_passed` not tracked~~ | RESOLVED (TQ-120) | Server emits via `/api/artifacts/verify` + `/api/lessons/[id]/complete` when an artifact is present. Properties are sanitised by `lib/analytics/safe-properties.ts` before leaving the server. |
| ~~`plan_revised` not tracked~~ | RESOLVED (TQ-120) | Server emits via `/api/planner/plan-revision`. `reason_bucket` added for categorical analysis; raw `revision_summary` is dropped by the sanitiser. |
| Dual-tracked events cause double counting | LOW | Either remove client-side tracking for `hearing_complete` and `plan_generated` or deduplicate in PostHog queries. Server-side is more reliable. |
| `graduation_reached` DB count is 0 | LOW | Funnel dashboard hardcodes graduation_reached = 0. Should query `certificates` table or add a `graduations` table. |
| No `signup` / `login` event | MEDIUM | No event tracks authentication actions. Add for funnel top measurement. |
| No `chat_message_sent` event | LOW | Mentor/lesson chat messages are not individually tracked. Useful for engagement depth. |

---

## 7. File Index

| Category | File |
|----------|------|
| PostHog init | `apps/web/src/lib/analytics/posthog.ts` |
| Event definitions (legacy) | `apps/web/src/lib/analytics/events.ts` |
| Event definitions (v2) | `apps/web/src/lib/analytics/events.v2.ts` |
| Typed track helpers | `apps/web/src/lib/analytics/track-helpers.ts` |
| Unified client (dedupe + sanitiser) | `apps/web/src/lib/analytics/client.ts` |
| PII sanitiser (TQ-120) | `apps/web/src/lib/analytics/safe-properties.ts` |
| Barrel export (legacy) | `apps/web/src/lib/analytics/index.ts` |
| Barrel export (v2) | `apps/web/src/lib/analytics/index.v2.ts` |
| Server capture | `apps/web/src/lib/analytics/server.ts` |
| Lesson mount tracker (TQ-120) | `apps/web/src/components/analytics/lesson-started-tracker.tsx` |
| Blocked click tracker (TQ-120) | `apps/web/src/components/analytics/blocked-click-tracker.tsx` |
| PostHog provider | `apps/web/src/components/analytics/posthog-provider.tsx` |
| Web Vitals | `apps/web/src/components/analytics/web-vitals.tsx` |
| Sentry client | `apps/web/sentry.client.config.ts` |
| Sentry server | `apps/web/sentry.server.config.ts` |
| Sentry edge | `apps/web/sentry.edge.config.ts` |
| Instrumentation | `apps/web/src/instrumentation.ts` |
| AI metrics | `apps/web/src/lib/observability/ai-metrics.ts` |
| Fetch retry | `apps/web/src/lib/api/fetch-with-retry.ts` |
| Global error | `apps/web/src/app/global-error.tsx` |
| AI error boundary | `apps/web/src/components/ui/ai-error-boundary.tsx` |
| Middleware | `apps/web/src/middleware.ts` |
| Next config | `apps/web/next.config.ts` |
| Funnel API | `apps/web/src/app/api/analytics/funnel/route.ts` |
| Vitals API | `apps/web/src/app/api/vitals/route.ts` |
| Analytics page | `apps/web/src/app/(app)/analytics/page.tsx` |
