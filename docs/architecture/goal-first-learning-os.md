# ADR: Goal-First Learning OS Architecture

Status: **Proposed**
Date: 2026-04-04
Author: Architecture Team

---

## 1. Context

### Current Architecture: Track-First

The School platform currently routes learners through a rigid track-first pipeline:

```
Goal (free text) -> regex match (detectIntentFromGoal) -> Track ID -> Track lesson sequence -> Plan
```

Four tracks are defined as TypeScript source-of-truth files totaling 3,585 lines of hardcoded curriculum:

| Track | File | Lines |
|---|---|---|
| web-builder-ai | `web-builder-track.ts` | 1,852 |
| ai-automation | `ai-automation-track.ts` | 614 |
| ai-content-creator | `ai-content-creator-track.ts` | 581 |
| ai-app-builder | `ai-app-builder-track.ts` | 538 |

`track-registry.ts` maps goals to tracks via `TrackIntentPattern` regex arrays. If no pattern matches, the goal is classified as `'unsupported'` and logged to `unsupported_goal_log`.

### Why This Is Broken

**1. Cannot scale to arbitrary domains.**
Adding a new domain (e.g., "AI data analysis", "AI video production") requires:
- Writing a new `*-track.ts` file (500-1800 lines of TypeScript)
- Adding regex patterns to `track-registry.ts`
- Updating `seed.sql` with matching theme/course/lesson rows
- Modifying `generic-track-planner.ts` for the new track's step structure
- Updating graduation criteria, flow edges, modules, milestones
- Touching 45-50 files across the codebase (documented in `lesson-sources.md` Section 10)

This is a code change, not a content change.

**2. Lessons are locked to tracks.**
Each `LessonChunk` has a mandatory `trackId` field. A lesson on "Git basics" defined in `web-builder-ai` cannot be reused in `ai-app-builder` without duplication. The `flowEdges` graph is track-scoped, so cross-track lesson references require `multi-track.ts` workarounds.

**3. Graduation is completion-based, not evidence-based.**
`getGraduationCriteriaForTrack(trackId)` returns a list of string labels. The actual graduation check in `graduation.ts` counts completed milestones and lesson counts. There is no rubric evaluation, no competency mapping, no evidence-of-capability requirement beyond "did you submit something to `artifacts` and did AI say it looks okay (first 500 chars)?"

**4. Plan structure is hardcoded to three steps.**
`zai-planner.ts` forces all plans into `scope-goal` / `setup-workspace` / `ship-first-slice`. Non-web-building goals hit `coming-soon`. The AI selects from a fixed candidate list per step, not from a capability graph.

**5. Dual data model creates drift.**
`LessonChunk` (TypeScript, 3,585 lines) and `Lesson` (Supabase DB, 30 tables) coexist with ID-based reconciliation in `lesson-library-browser.ts`. The TS files are the source of truth for curriculum logic (flow, prerequisites, modules), while the DB is the source of truth for user progress. This split makes content management fragile.

**6. AI mentor cannot reason about capabilities.**
Mentor chat receives `title + summary` only -- no lesson body, no capability tags in context. Lesson recommendations are branch-selection within a fixed track graph, not goal-aware capability gap analysis.

---

## 2. Decision

Switch to a **Goal-First** architecture where:

- **Goal** is the primary entry point. A learner declares what they want to achieve in natural language. There is no regex-to-track mapping. Goal resolution uses AI + capability graph lookup, not pattern matching.

- **Capability** is what a learner can demonstrate ("can deploy a Next.js app to Vercel", "can write a Claude prompt that extracts structured data"). Capabilities replace "completed lesson X" as the unit of learning progress.

- **Lesson** is a versioned, domain-independent learning asset with block-based content. Lessons are not owned by tracks. They teach one or more capabilities and declare their prerequisites as capabilities, not lesson IDs.

- **Plan** is a user-specific compiled lesson graph. It is computed from the delta between the learner's current capabilities and their goal's required capabilities. It is not a static track sequence.

- **Evidence** proves capability. A learner submits artifacts (code repo, deployed URL, screenshot, self-check, quiz score) that are evaluated against a rubric, not just "content is non-empty."

- **Graduation** requires competency assessment against the goal's capability set, not lesson completion count.

- **Track** becomes a marketing/discovery view -- a curated projection of lessons into a browsable collection. It is not a primary key in the domain model.

- **AI mentor** orchestrates existing lessons from the lesson catalog. It does not generate courses from scratch. It selects, sequences, and adapts existing content based on the learner's capability state.

---

## 3. Canonical Domain Model

### 3.1 Goal

The learner's declared objective. Primary entry point for the entire system.

```
Goal {
  id              UUID        PK
  user_id         UUID        FK -> auth.users, NOT NULL
  raw_text        TEXT        NOT NULL  -- learner's original input
  normalized_text TEXT        NOT NULL  -- lowercase, trimmed
  domain_id       UUID        FK -> Domain, NULL (resolved after hearing)
  status          ENUM        NOT NULL  -- 'hearing' | 'planning' | 'active' | 'completed' | 'abandoned'
  required_capabilities UUID[] -- resolved capability IDs for this goal
  hearing_session_id UUID    FK -> HearingSession, NULL
  active_plan_id  UUID        FK -> Plan, NULL
  created_at      TIMESTAMPTZ NOT NULL
  updated_at      TIMESTAMPTZ NOT NULL
}
```

**Relationships:**
- 1:1 with active Plan
- 1:N with Plan (revision history)
- N:M with Capability (via `required_capabilities` or join table `goal_capabilities`)
- 1:1 with HearingSession

**Replaces:** `goal_history`, `unsupported_goal_log` (merged), `learner_state.active_track_id` (removed)

### 3.2 Domain

Broad area of learning. Replaces the concept of "track intent."

```
Domain {
  id              UUID        PK
  slug            TEXT        UNIQUE, NOT NULL  -- 'web', 'automation', 'content', 'app', 'data-analysis'
  label           TEXT        NOT NULL  -- display name
  description     TEXT
  icon            TEXT
  is_active       BOOLEAN     NOT NULL, DEFAULT true
  created_at      TIMESTAMPTZ NOT NULL
}
```

**Relationships:**
- 1:N with Capability
- 1:N with Goal (optional association)

**Key difference from Track:** A domain is a classification axis, not a lesson container. Adding a domain is an INSERT, not a code change.

### 3.3 Capability

A specific, assessable skill within a domain. The atomic unit of learning progress.

```
Capability {
  id              UUID        PK
  domain_id       UUID        FK -> Domain, NOT NULL
  slug            TEXT        UNIQUE, NOT NULL  -- 'deploy-nextjs-to-vercel'
  label           TEXT        NOT NULL
  description     TEXT        NOT NULL
  assessment_hint TEXT        -- guidance for evidence evaluation
  level           ENUM        NOT NULL  -- 'foundational' | 'intermediate' | 'advanced'
  prerequisite_capability_ids UUID[]  -- capability-level prerequisites
  created_at      TIMESTAMPTZ NOT NULL
  updated_at      TIMESTAMPTZ NOT NULL
}
```

**Relationships:**
- N:M with Lesson (via LessonObjective)
- N:M with Goal (via goal_capabilities)
- Self-referential prerequisites (via `prerequisite_capability_ids` or join table)

**Key invariant:** A learner's progress is measured by acquired capabilities, not completed lessons. Two different lessons can grant the same capability.

### 3.4 Lesson

Canonical identity of a learning asset. Immutable identity; content lives in LessonVersion.

```
Lesson {
  id              UUID        PK
  slug            TEXT        UNIQUE, NOT NULL  -- 'git-basics', 'claude-prompt-engineering'
  canonical_title TEXT        NOT NULL
  created_at      TIMESTAMPTZ NOT NULL
  updated_at      TIMESTAMPTZ NOT NULL
  retired_at      TIMESTAMPTZ NULL  -- soft delete
}
```

**Relationships:**
- 1:N with LessonVersion
- N:M with Capability (via LessonObjective)
- N:M with ContentTag
- 1:N with LessonPrerequisite (as source)
- 1:N with LessonVariant

**Key change:** No `trackId`, no `moduleId`, no `course_id`. Lessons are domain-independent assets.

### 3.5 LessonVersion

Immutable published snapshot of lesson content.

```
LessonVersion {
  id              UUID        PK
  lesson_id       UUID        FK -> Lesson, NOT NULL
  version         INTEGER     NOT NULL  -- monotonically increasing
  title           TEXT        NOT NULL
  summary         TEXT        NOT NULL
  promise         TEXT        -- "what you'll be able to do after this"
  difficulty_level ENUM       NOT NULL  -- 'beginner' | 'intermediate' | 'advanced'
  estimated_minutes INTEGER   NOT NULL
  delivery_mode   ENUM        NOT NULL  -- 'guided' | 'interactive'
  published_at    TIMESTAMPTZ NOT NULL
  published_by    UUID        FK -> auth.users, NULL  -- admin who published
  deprecated_at   TIMESTAMPTZ NULL
}

UNIQUE(lesson_id, version)
```

**Relationships:**
- 1:N with LessonBlock (ordered content)
- 1:N with LessonAsset

**Key invariant:** Once published, a LessonVersion is immutable. Edits create version N+1. Plans reference a specific version so learners don't see content shift mid-lesson.

### 3.6 LessonBlock

Content unit within a lesson version. Ordered sequence of typed blocks.

```
LessonBlock {
  id              UUID        PK
  lesson_version_id UUID     FK -> LessonVersion, NOT NULL
  order_index     INTEGER     NOT NULL
  block_type      ENUM        NOT NULL
    -- 'markdown' | 'image' | 'video' | 'checklist' | 'quiz'
    -- | 'prompt' | 'reflection' | 'rubric' | 'code-playground'
  content         JSONB       NOT NULL  -- schema depends on block_type
  created_at      TIMESTAMPTZ NOT NULL
}

UNIQUE(lesson_version_id, order_index)
```

**Block type schemas (JSONB `content` field):**

| block_type | content schema |
|---|---|
| `markdown` | `{ "body": "## Heading\n..." }` |
| `image` | `{ "asset_id": UUID, "alt": "...", "caption": "..." }` |
| `video` | `{ "asset_id": UUID, "poster_asset_id": UUID, "caption": "..." }` |
| `checklist` | `{ "items": [{ "label": "...", "required": bool }] }` |
| `quiz` | `{ "question": "...", "options": [...], "correct_index": int, "explanation": "..." }` |
| `prompt` | `{ "instruction": "...", "example_input": "...", "example_output": "..." }` |
| `reflection` | `{ "question": "...", "guidance": "..." }` |
| `rubric` | `{ "criteria": [{ "label": "...", "levels": [...] }] }` |
| `code-playground` | `{ "language": "...", "starter_code": "...", "test_patterns": [...] }` |

**Replaces:** `LessonChunk.content`, `LessonChunk.whyThisMatters`, `LessonChunk.howToDo`, `LessonChunk.commonBlockers`, `LessonChunk.confirmationMethod`, `LessonChunk.exercises` -- all collapsed into typed blocks.

### 3.7 LessonAsset

Media file reference for images, videos, and downloadable resources.

```
LessonAsset {
  id              UUID        PK
  lesson_version_id UUID     FK -> LessonVersion, NOT NULL
  file_path       TEXT        NOT NULL  -- relative path in storage
  mime_type       TEXT        NOT NULL
  alt_text        TEXT
  file_size_bytes INTEGER
  width           INTEGER     NULL  -- for images/video
  height          INTEGER     NULL
  duration_seconds INTEGER    NULL  -- for video/audio
  created_at      TIMESTAMPTZ NOT NULL
}
```

**Replaces:** `LessonMediaRef[]` in `lesson-media.ts`, `apps/web/public/lesson-assets/` path conventions.

### 3.8 LessonObjective

Links a lesson to the capabilities it teaches. Many-to-many join table.

```
LessonObjective {
  id              UUID        PK
  lesson_id       UUID        FK -> Lesson, NOT NULL
  capability_id   UUID        FK -> Capability, NOT NULL
  proficiency     ENUM        NOT NULL  -- 'introduces' | 'practices' | 'assesses'
  created_at      TIMESTAMPTZ NOT NULL
}

UNIQUE(lesson_id, capability_id)
```

**`proficiency` semantics:**
- `introduces` -- lesson explains the concept, learner may not be able to do it yet
- `practices` -- lesson provides hands-on practice of the capability
- `assesses` -- lesson includes evidence collection that can prove the capability

### 3.9 LessonPrerequisite

Directed graph edge between lessons. Defines hard and soft ordering.

```
LessonPrerequisite {
  id              UUID        PK
  lesson_id       UUID        FK -> Lesson, NOT NULL  -- the lesson that requires
  required_lesson_id UUID     FK -> Lesson, NOT NULL  -- must be done first
  strength        ENUM        NOT NULL  -- 'hard' | 'recommended' | 'reinforcing'
  created_at      TIMESTAMPTZ NOT NULL
}

UNIQUE(lesson_id, required_lesson_id)
CHECK(lesson_id != required_lesson_id)
```

**Replaces:** `LessonChunk.prerequisiteIds`, `LessonChunk.recommendedBeforeIds`, `LessonChunk.mutuallyReinforcingIds` -- unified into a single table with `strength` enum.

### 3.10 LessonVariant

Tool-specific overlay for lessons that differ by tooling context.

```
LessonVariant {
  id              UUID        PK
  lesson_id       UUID        FK -> Lesson, NOT NULL
  tool_context    TEXT        NOT NULL  -- 'claude-code' | 'codex-cli' | 'manual' | 'cursor'
  lesson_version_id UUID     FK -> LessonVersion, NOT NULL  -- variant-specific version
  label           TEXT        NOT NULL  -- display label for variant selection
  created_at      TIMESTAMPTZ NOT NULL
}

UNIQUE(lesson_id, tool_context)
```

**Replaces:** The current pattern where tool-specific lessons are entirely separate `LessonChunk` entries (e.g., `lesson_web_builder_044` for Claude Code vs `lesson_web_builder_045` for Codex). Variants share the same canonical lesson identity.

### 3.11 Plan

A user-specific compiled lesson graph for a given goal.

```
Plan {
  id              UUID        PK
  user_id         UUID        FK -> auth.users, NOT NULL
  goal_id         UUID        FK -> Goal, NOT NULL
  version         INTEGER     NOT NULL, DEFAULT 1
  parent_plan_id  UUID        FK -> Plan, NULL  -- revision chain
  title           TEXT        NOT NULL
  summary         TEXT
  status          ENUM        NOT NULL  -- 'draft' | 'active' | 'superseded' | 'completed'
  compiled_at     TIMESTAMPTZ NOT NULL  -- when AI generated this plan
  created_at      TIMESTAMPTZ NOT NULL
  updated_at      TIMESTAMPTZ NOT NULL
}

UNIQUE(goal_id, version)
```

**Relationships:**
- 1:N with PlanNode
- 1:N with PlanRevision
- Self-referential via `parent_plan_id`

**Key change:** Plan is tied to Goal, not Track. `status` replaces `is_active` boolean. No `milestones` table -- milestone concept is absorbed into PlanNode ordering/grouping.

### 3.12 PlanNode

Individual step in a plan. Links to a specific lesson + version.

```
PlanNode {
  id              UUID        PK
  plan_id         UUID        FK -> Plan, NOT NULL
  lesson_id       UUID        FK -> Lesson, NOT NULL
  lesson_version_id UUID     FK -> LessonVersion, NOT NULL
  variant_id      UUID        FK -> LessonVariant, NULL  -- if tool-specific
  order_index     INTEGER     NOT NULL
  group_label     TEXT        NULL  -- optional grouping ("Setup", "Build", "Ship")
  rationale       TEXT        -- why AI included this lesson
  status          ENUM        NOT NULL  -- 'pending' | 'in-progress' | 'completed' | 'skipped' | 'blocked'
  started_at      TIMESTAMPTZ NULL
  completed_at    TIMESTAMPTZ NULL
  created_at      TIMESTAMPTZ NOT NULL
  updated_at      TIMESTAMPTZ NOT NULL
}
```

**Replaces:** `milestones` + `milestone_lessons` + `task_progress` -- three tables collapsed into one. The current `milestones.title/description` becomes `group_label`. The current `task_progress.do_text/learn_text/why_text` moves to lesson content (LessonBlock).

### 3.13 PlanRevision

Audit record of why a plan was changed.

```
PlanRevision {
  id              UUID        PK
  plan_id         UUID        FK -> Plan, NOT NULL  -- the NEW plan version
  previous_plan_id UUID      FK -> Plan, NOT NULL  -- the plan it replaced
  trigger         ENUM        NOT NULL  -- 'learner_request' | 'ai_review' | 'blocked_accumulation' | 'feedback_driven'
  reason          TEXT        NOT NULL  -- human-readable explanation
  added_node_ids  UUID[]      -- PlanNode IDs added in this revision
  removed_node_ids UUID[]     -- PlanNode IDs removed (from previous plan)
  reordered       BOOLEAN     NOT NULL, DEFAULT false
  created_at      TIMESTAMPTZ NOT NULL
}
```

**Replaces:** The implicit revision chain via `plans.parent_plan_id` + `plans.version`. PlanRevision makes the reason and diff explicit.

### 3.14 EvidenceSubmission

Artifact proof that a learner has acquired a capability.

```
EvidenceSubmission {
  id              UUID        PK
  user_id         UUID        FK -> auth.users, NOT NULL
  plan_node_id    UUID        FK -> PlanNode, NULL  -- optional plan context
  capability_id   UUID        FK -> Capability, NOT NULL
  evidence_type   ENUM        NOT NULL  -- 'url' | 'text' | 'screenshot' | 'repo' | 'file' | 'self_check' | 'quiz_score'
  title           TEXT
  content         TEXT        NOT NULL  -- URL, text body, file path, etc.
  metadata        JSONB       DEFAULT '{}'  -- type-specific metadata
  created_at      TIMESTAMPTZ NOT NULL
  updated_at      TIMESTAMPTZ NOT NULL
}
```

**Replaces:** `artifacts` table. Key change: evidence is linked to Capability, not to milestone_id/step_id strings.

### 3.15 CompetencyAssessment

Rubric-based evaluation of evidence against a capability.

```
CompetencyAssessment {
  id              UUID        PK
  evidence_id     UUID        FK -> EvidenceSubmission, NOT NULL
  capability_id   UUID        FK -> Capability, NOT NULL
  assessor        ENUM        NOT NULL  -- 'ai' | 'self' | 'mentor'
  verdict         ENUM        NOT NULL  -- 'demonstrated' | 'partial' | 'not_demonstrated'
  rubric_scores   JSONB       NULL  -- { "criteria_label": score } when rubric block exists
  summary         TEXT        NOT NULL  -- assessor's explanation
  next_steps      JSONB       DEFAULT '[]'  -- [{ "title": "...", "description": "..." }]
  corrections     JSONB       DEFAULT '[]'  -- [{ "point": "...", "suggestion": "..." }]
  assessed_at     TIMESTAMPTZ NOT NULL
  created_at      TIMESTAMPTZ NOT NULL
}
```

**Replaces:** `milestone_progress` + the inline verification logic in `artifact-verification.ts`. Key change: assessment is per-capability with structured rubric scores, not per-milestone with a boolean `verified`.

### 3.16 GraduationDecision

Final determination that a learner has achieved their goal.

```
GraduationDecision {
  id              UUID        PK
  user_id         UUID        FK -> auth.users, NOT NULL
  goal_id         UUID        FK -> Goal, NOT NULL
  plan_id         UUID        FK -> Plan, NOT NULL
  decision        ENUM        NOT NULL  -- 'graduated' | 'deferred' | 'partial'
  demonstrated_capabilities UUID[]  -- capability IDs with 'demonstrated' verdict
  missing_capabilities UUID[]       -- capability IDs not yet demonstrated
  summary         TEXT        NOT NULL
  certificate_id  UUID        FK -> Certificate, NULL
  decided_at      TIMESTAMPTZ NOT NULL
  created_at      TIMESTAMPTZ NOT NULL
}
```

**Replaces:** `certificates` table's role as both graduation record and certificate. GraduationDecision is the decision; Certificate (retained) is the generated document.

### 3.17 ContentTag

Discovery and filtering metadata for lessons.

```
ContentTag {
  id              UUID        PK
  slug            TEXT        UNIQUE, NOT NULL  -- 'nextjs', 'prompt-engineering', 'git'
  label           TEXT        NOT NULL
  category        ENUM        NOT NULL  -- 'technology' | 'skill' | 'persona' | 'goal' | 'blocker'
  created_at      TIMESTAMPTZ NOT NULL
}

-- Join table
LessonTag {
  lesson_id       UUID        FK -> Lesson, NOT NULL
  tag_id          UUID        FK -> ContentTag, NOT NULL
  PRIMARY KEY (lesson_id, tag_id)
}
```

**Replaces:** `LessonChunk.stack`, `LessonChunk.personaTags`, `LessonChunk.goalTags`, `LessonChunk.capabilityTags`, `LessonChunk.blockerTags`, `LessonChunk.searchTerms`, `lessons.tags[]` -- all unified into a single tagging system with categories.

### 3.18 ToolProfile

Learner's tool environment, used for variant selection and plan compilation.

```
ToolProfile {
  id              UUID        PK
  user_id         UUID        FK -> auth.users, NOT NULL
  tool_name       TEXT        NOT NULL  -- 'claude-code' | 'codex-cli' | 'cursor' | 'manual'
  version         TEXT        NULL
  is_installed    BOOLEAN     NOT NULL, DEFAULT false
  preferred       BOOLEAN     NOT NULL, DEFAULT false
  detected_at     TIMESTAMPTZ NULL  -- from hearing or system detection
  created_at      TIMESTAMPTZ NOT NULL
  updated_at      TIMESTAMPTZ NOT NULL
}

UNIQUE(user_id, tool_name)
```

**Replaces:** `learner_profile.available_ai_tools[]` (string array) and `learner_state.signals` (JSONB). Structured tool profiles enable automatic variant selection in plan compilation.

### 3.19 RecommendationEvent

Audit trail for why a specific lesson was included in a plan or suggested next.

```
RecommendationEvent {
  id              UUID        PK
  user_id         UUID        FK -> auth.users, NOT NULL
  plan_node_id    UUID        FK -> PlanNode, NULL
  lesson_id       UUID        FK -> Lesson, NOT NULL
  trigger         ENUM        NOT NULL  -- 'plan_compilation' | 'branch_recommendation' | 'blocked_fallback' | 'feedback_driven' | 'mentor_suggestion'
  reasoning       TEXT        NOT NULL  -- AI's explanation
  capability_gap  UUID[]      -- which capabilities this fills
  score           FLOAT       NULL  -- recommendation confidence (0-1)
  accepted        BOOLEAN     NULL  -- did learner follow recommendation
  created_at      TIMESTAMPTZ NOT NULL
}
```

**Replaces:** The opaque recommendation logic in `recommend-next/route.ts`. Every recommendation is traceable.

### 3.20 TrackView

Marketing/discovery projection of lessons into a browsable track.

```
TrackView {
  id              UUID        PK
  slug            TEXT        UNIQUE, NOT NULL  -- 'web-builder-ai'
  domain_id       UUID        FK -> Domain, NOT NULL
  label           TEXT        NOT NULL
  headline        TEXT        NOT NULL
  summary         TEXT
  icon            TEXT
  target_learners TEXT[]      DEFAULT '{}'
  display_order   INTEGER     NOT NULL, DEFAULT 0
  is_published    BOOLEAN     NOT NULL, DEFAULT false
  created_at      TIMESTAMPTZ NOT NULL
  updated_at      TIMESTAMPTZ NOT NULL
}

-- Join table: which lessons appear in this track view and in what order
TrackViewLesson {
  track_view_id   UUID        FK -> TrackView, NOT NULL
  lesson_id       UUID        FK -> Lesson, NOT NULL
  order_index     INTEGER     NOT NULL
  PRIMARY KEY (track_view_id, lesson_id)
}
```

**Key invariant:** TrackView is read-only for the learning engine. Plans are never compiled from TrackView. It exists purely for `/tracks/[slug]` browse pages and marketing landing pages.

---

## 4. Key Design Principles

### Principle 1: Track is a view, not a primary key

No runtime learning logic (plan compilation, prerequisite checking, graduation, AI prompts) references `track_id` as a primary lookup key. TrackView is a presentation-layer projection, equivalent to a database view. A lesson can appear in zero, one, or many TrackViews.

### Principle 2: Lesson is a versioned asset, not embedded code

Lesson content lives in `LessonVersion` + `LessonBlock` rows, not in TypeScript files. The 3,585-line track TS files are migrated to DB rows. Content changes are INSERT operations (new version), not code deployments. The `lesson-markdown.ts` / `lesson-body-content.ts` build pipeline is replaced by block-type-aware rendering.

### Principle 3: Plan is compiled per user, not a static sequence

Plan compilation takes: `(Goal, LearnerCapabilities, LessonCatalog, ToolProfile) -> Plan`. The compiler identifies the capability gap between current state and goal requirements, then selects and sequences lessons from the catalog to fill that gap. Two learners with the same goal but different prior capabilities get different plans.

### Principle 4: Graduation requires evidence, not completion count

A learner graduates when all required capabilities for their goal have `CompetencyAssessment.verdict = 'demonstrated'`. Completing lessons without demonstrating capability is not sufficient. The assessment rubric is embedded in the lesson content (rubric blocks) and in `Capability.assessment_hint`.

### Principle 5: AI orchestrates existing lessons, doesn't generate courses

The AI mentor's role is:
- Plan compilation: select lessons from catalog to fill capability gaps
- Evidence evaluation: assess submissions against rubrics
- Adaptive sequencing: reorder/substitute lessons based on learner progress
- Contextualization: explain why a lesson matters for this learner's goal

The AI does NOT:
- Generate lesson content on the fly
- Create new capabilities or domains
- Override published rubrics

### Principle 6: New domains are added via content packs + config, not code forks

Adding a new domain requires:
1. INSERT rows into `domains` (1 row)
2. INSERT rows into `capabilities` (10-50 rows)
3. INSERT rows into `lessons` + `lesson_versions` + `lesson_blocks` (content)
4. INSERT rows into `lesson_objectives` (capability links)
5. Optionally, INSERT a `TrackView` for marketing

Zero TypeScript changes. Zero deployments for content additions.

### Principle 7: mentor_memory is auxiliary, not source of truth

`mentor_memory` remains as a session-scoped AI prompt enrichment store. It is NOT the system of record for:
- What capabilities a learner has (that's `CompetencyAssessment`)
- What lessons are completed (that's `PlanNode.status`)
- What the learner's goal is (that's `Goal`)

mentor_memory is compressed, archived, and may be lossy. All durable state lives in the entities above.

---

## 5. What Changes

### 5.1 Subsystem Changes

#### Goal Resolution (currently: `intent.ts` + `track-registry.ts`)
**Before:** `detectIntentFromGoal()` runs regex against 4 track intent patterns. No match = unsupported.
**After:** Goal is stored in `Goal` table. AI + capability graph lookup identifies required capabilities. No regex. No unsupported classification -- all goals get a plan (with varying coverage levels).

**Files deleted:**
- `lib/planner/intent.ts` (regex-based intent detection)
- `TrackIntentPattern` type and all regex arrays in track TS files

**Files modified:**
- `track-registry.ts` -- gutted. Becomes a thin read-through cache for TrackView display, not a curriculum engine.

#### Curriculum Definition (currently: 4 track TS files + seed.sql)
**Before:** 3,585 lines of TypeScript define lessons, modules, milestones, flow edges.
**After:** All curriculum content lives in DB tables (`lessons`, `lesson_versions`, `lesson_blocks`, `lesson_objectives`, `lesson_prerequisites`, `capabilities`).

**Files deleted:**
- `lib/curriculum/web-builder-track.ts` (1,852 lines)
- `lib/curriculum/ai-automation-track.ts` (614 lines)
- `lib/curriculum/ai-content-creator-track.ts` (581 lines)
- `lib/curriculum/ai-app-builder-track.ts` (538 lines)
- `lib/curriculum/lesson-media.ts` (media refs move to LessonAsset)
- `lib/curriculum/lesson-markdown.ts` (replaced by block rendering)
- `lib/curriculum/lesson-body-content.ts` (replaced by block rendering)

**Files heavily modified:**
- `lib/curriculum/lesson-library.ts` -- rewritten to query DB instead of TS imports
- `lib/curriculum/lesson-library-browser.ts` -- simplified; no more TS/DB merge logic
- `lib/curriculum/lesson-flow-resolver.ts` -- replaced by plan-node-based flow resolution

#### Plan Generation (currently: `zai-planner.ts` + `mock-planner.ts`)
**Before:** 3-step hardcoded structure (scope-goal/setup-workspace/ship-first-slice). AI picks from per-step candidate list.
**After:** Plan compiler takes capability gap and finds optimal lesson sequence. AI prompt includes learner's current capabilities, goal capabilities, and full lesson catalog metadata. Output is an ordered list of PlanNodes with rationale.

**Files deleted:**
- `lib/planner/adapters/mock-planner.ts` (hardcoded fallback plans)
- `lib/planner/generic-track-planner.ts` (track-based plan construction)
- `lib/planner/task-lessons.ts` (task-to-lesson mapping)
- `lib/planner/task-links.ts` (task link generation)

**Files heavily modified:**
- `lib/planner/adapters/zai-planner.ts` -- prompt rewrite for capability-based planning
- `lib/planner/server.ts` -- new plan compilation pipeline
- `lib/planner/server-persistence.ts` -- writes to new Plan/PlanNode schema

#### Lesson Flow (currently: `lesson-flow-resolver.ts` with track-scoped flowEdges)
**Before:** `resolveNextInFlow()` walks track's `flowEdges` array. Branch/merge/next types within one track.
**After:** Flow is determined by PlanNode ordering within a Plan. Next lesson = next PlanNode where `status = 'pending'`. Branch points are resolved by AI recommendation or learner choice, recorded in RecommendationEvent.

**Files deleted:**
- `LessonFlowEdge` type and all `flowEdges` arrays in track TS files

**Files heavily modified:**
- `lib/curriculum/lesson-flow-resolver.ts` -- rewritten for PlanNode-based resolution

#### Prerequisite Checking (currently: `prerequisite-check.ts` with lesson ID arrays)
**Before:** Check `user_progress` for completion of specific lesson IDs listed in `prerequisiteIds[]`.
**After:** Check if the learner has demonstrated the prerequisite capabilities (via CompetencyAssessment) OR has completed a PlanNode for a lesson that teaches those capabilities.

**Files modified:**
- `lib/curriculum/prerequisite-check.ts` -- capability-based prerequisite resolution

#### Graduation (currently: `graduation.ts` with track-scoped criteria)
**Before:** `getGraduationCriteriaForTrack(trackId)` returns string labels. Check milestone count.
**After:** GraduationDecision is computed from: all `Goal.required_capabilities` have at least one `CompetencyAssessment.verdict = 'demonstrated'`. AI produces summary and decision.

**Files modified:**
- `lib/planner/graduation.ts` -- rewritten for capability-based graduation

#### Evidence & Verification (currently: `artifact-verification.ts`)
**Before:** AI evaluates first 500 chars of artifact content. Boolean result + `milestone_progress` update.
**After:** AI evaluates EvidenceSubmission against `Capability.assessment_hint` + rubric blocks. Produces CompetencyAssessment with structured rubric scores, verdict, next steps.

**Files modified:**
- `lib/planner/artifact-verification.ts` -- rewritten for rubric-based assessment
- `api/artifacts/verify/route.ts` -- new request/response schema

#### Multi-Track (currently: `multi-track.ts`)
**Before:** Track-by-track progress calculation, cross-track skill map.
**After:** Capability-based progress. No track-level progress concept. Skills are capabilities; "cross-track" concept dissolves.

**Files deleted:**
- `lib/curriculum/multi-track.ts`
- `hooks/use-multi-track.ts`
- `components/mentor/cross-track-skill-map.tsx`
- `components/mentor/cross-track-timeline.tsx`
- `components/mentor/track-progress-cards.tsx`

**Replaced by:** Capability progress dashboard showing demonstrated/partial/missing per goal.

#### AI Prompts (all flows in `ai-flows.md`)
**Before:** Prompts reference track IDs, step structure names, track-scoped lesson candidates.
**After:** Prompts reference capabilities, capability gaps, lesson metadata with objectives. All 12 AI flows updated.

### 5.2 Database Tables

#### Tables Deleted (replaced by new entities)
| Current Table | Replaced By |
|---|---|
| `themes` | `Domain` (simplified) |
| `courses` | Removed -- was a grouping layer between theme and lesson. Absorbed by Domain + ContentTag |
| `milestones` | `PlanNode.group_label` (plan-level grouping) |
| `milestone_lessons` | `PlanNode` (direct lesson reference) |
| `milestone_progress` | `CompetencyAssessment` |
| `task_progress` | `PlanNode.status` + fields |
| `unsupported_goal_log` | `Goal` with status handling |
| `goal_history` | `Goal` (unified) |
| `modules` (DB) | `TrackView` + `ContentTag` for display grouping |
| `user_progress` | `PlanNode.status` + `CompetencyAssessment` |

#### Tables Retained (modified)
| Table | Changes |
|---|---|
| `plans` | Add `goal_id` FK, add `status` enum, remove `is_active` boolean |
| `artifacts` | Renamed to `evidence_submissions`, add `capability_id` FK, remove milestone/step string IDs |
| `certificates` | Add `graduation_decision_id` FK |
| `learner_profile` | Remove `available_ai_tools[]` (moved to ToolProfile) |
| `learner_state` | Remove `active_track_id`, add `active_goal_id` |
| `lessons` (DB) | Radical schema change to match new Lesson entity |

#### Tables Retained (unchanged)
- `mentor_memory`, `mentor_memory_archive`
- `lesson_feedback`, `ai_response_feedback`
- `lesson_chat_messages`, `hearing_chat_messages`
- `workspace_snapshots`
- `email_notification_preferences`, `email_notification_log`
- `notifications`, `notification_preferences`
- `exercise_results`

#### New Tables
- `domains`
- `capabilities`
- `goal_capabilities` (join)
- `lesson_versions`
- `lesson_blocks`
- `lesson_assets`
- `lesson_objectives`
- `lesson_prerequisites`
- `lesson_variants`
- `lesson_tags` (join)
- `content_tags`
- `plan_nodes`
- `plan_revisions`
- `evidence_submissions`
- `competency_assessments`
- `graduation_decisions`
- `tool_profiles`
- `recommendation_events`
- `track_views`
- `track_view_lessons` (join)
- `goals` (replaces goal_history + unsupported_goal_log)

### 5.3 API Routes

| Current Route | Change |
|---|---|
| `POST /api/planner/hearing` | Modified: goal resolution writes to `goals` table, not `learner_state.active_track_id` |
| `POST /api/planner/recommendation` | Major rewrite: capability-gap-based plan compilation |
| `POST /api/planner/mentor-chat` | Modified: prompt includes capability state instead of track steps |
| `POST /api/planner/plan-review` | Modified: operates on PlanNodes, trigger detection uses capability gaps |
| `POST /api/planner/plan-revision` | Modified: creates new Plan version with PlanRevision audit |
| `POST /api/planner/graduation` | Major rewrite: capability-based graduation decision |
| `POST /api/planner/multi-track` | Deleted: concept no longer exists |
| `POST /api/planner/next-goals` | Modified: AI-based next goal suggestion (replaces hardcoded list) |
| `POST /api/lessons/[id]/complete` | Modified: creates CompetencyAssessment entries for lesson's capabilities |
| `POST /api/lessons/[id]/next-flow` | Modified: PlanNode-based next resolution |
| `POST /api/lessons/[id]/recommend-next` | Modified: capability-aware recommendation |
| `POST /api/lessons/[id]/context-bridge` | Modified: capability context instead of track context |
| `POST /api/artifacts/verify` | Major rewrite: rubric-based CompetencyAssessment |
| `GET /api/lessons` (admin) | Modified: query new lesson/version schema |

### 5.4 Component Changes

| Component | Change |
|---|---|
| `lesson-content-renderer.tsx` | Rewritten: renders `LessonBlock[]` instead of Markdown string parsing |
| `lessons-browser.tsx` | Modified: filters by Domain + ContentTag, not track facets |
| `next-lesson-flow.tsx` | Modified: PlanNode-based next resolution |
| `planner-dashboard.tsx` | Rewritten: capability progress instead of track/milestone view |
| `focused-plan-view.tsx` | Modified: PlanNode list with group_label sections |
| `plan-display.tsx` | Modified: PlanNode-based display |
| `mentor-workspace-view.tsx` | Modified: goal + capability context |
| `homepage-entry.tsx` | Modified: goal entry, no track selection |

### 5.5 Files Deleted (complete list)

```
# Track definition files (3,585 lines)
apps/web/src/lib/curriculum/web-builder-track.ts
apps/web/src/lib/curriculum/ai-automation-track.ts
apps/web/src/lib/curriculum/ai-content-creator-track.ts
apps/web/src/lib/curriculum/ai-app-builder-track.ts

# Track-dependent build pipeline
apps/web/src/lib/curriculum/lesson-markdown.ts
apps/web/src/lib/curriculum/lesson-body-content.ts
apps/web/src/lib/curriculum/lesson-media.ts

# Track-based planning
apps/web/src/lib/planner/intent.ts
apps/web/src/lib/planner/adapters/mock-planner.ts
apps/web/src/lib/planner/generic-track-planner.ts
apps/web/src/lib/planner/task-lessons.ts
apps/web/src/lib/planner/task-links.ts

# Multi-track (concept dissolved)
apps/web/src/lib/curriculum/multi-track.ts
apps/web/src/hooks/use-multi-track.ts
apps/web/src/components/mentor/cross-track-skill-map.tsx
apps/web/src/components/mentor/cross-track-timeline.tsx
apps/web/src/components/mentor/track-progress-cards.tsx

# Track-specific tests
apps/web/e2e/four-tracks.spec.ts
apps/web/e2e/track-helpers.ts
apps/web/src/lib/curriculum/track-extensibility.test.ts
```

---

## 6. Risks and Mitigations

### Risk 1: Data migration complexity
**Risk:** 30 existing DB tables, 3,585 lines of TS curriculum, and live user data must be migrated without data loss. The dual-model (TS + DB) makes it unclear which is source of truth for each field.
**Mitigation:** Two-phase migration. Phase 1: write new tables alongside old, backfill from TS files via migration script, run both systems in parallel with feature flag. Phase 2: cut over reads to new tables, verify parity, drop old tables. TS-to-DB migration script is a one-time batch job that converts `LessonChunk` objects to `lesson_versions` + `lesson_blocks` rows.

### Risk 2: AI prompt quality regression
**Risk:** All 12 AI flows must be re-prompted. Current prompts are tuned through 100+ iterations (TQ-9 through TQ-103). New capability-based prompts may produce worse results initially.
**Mitigation:** A/B prompt testing framework. Keep old prompts as fallback behind feature flag. Measure via existing `ai_response_feedback` (positive/negative) and `lesson_feedback` (clarity/difficulty ratings). Only cut over when new prompts match or exceed baseline metrics.

### Risk 3: Plan compilation performance
**Risk:** Current plan generation queries a fixed candidate list per track (< 50 lessons). Goal-first compilation must search the entire lesson catalog (potentially hundreds) and compute capability gaps.
**Mitigation:** Pre-compute a capability-to-lesson index (materialized view or cache). Plan compilation prompt includes only the relevant subset of lessons (those teaching capabilities in the gap set). This keeps the AI prompt token count bounded.

### Risk 4: Content migration fidelity
**Risk:** Converting 3,585 lines of TS `LessonChunk` definitions to block-based `LessonVersion` + `LessonBlock` rows may lose nuance. Fields like `whyThisMatters`, `commonBlockers`, and `confirmationMethod` must map cleanly to block types.
**Mitigation:** Deterministic migration script with field-to-block mapping rules:
- `whyThisMatters` -> `markdown` block with `## Why This Matters` heading
- `howToDo` -> `markdown` block with `## How To Do` heading
- `commonBlockers` -> `markdown` block with `## Common Blockers` heading
- `confirmationMethod` -> `checklist` or `rubric` block depending on content
- `exercises[]` -> `code-playground` blocks
- `content` (existing Markdown) -> sequence of `markdown` blocks split at `##` boundaries

Each migrated lesson is validated: block count > 0, no empty content, all media refs have corresponding LessonAsset rows.

### Risk 5: Capability ontology design
**Risk:** The capability taxonomy must be comprehensive enough to cover all current lessons and extensible enough for new domains. A poorly designed capability set makes plan compilation inaccurate.
**Mitigation:** Start with capabilities extracted directly from existing `LessonChunk.capabilityTags` and `primaryOutcome` fields. Each existing tag becomes a candidate capability. Deduplicate and structure into domain hierarchy. Review with domain experts before migration. The ontology is additive -- new capabilities can always be inserted without breaking existing ones.

### Risk 6: Backward compatibility for active learners
**Risk:** Learners with in-progress plans reference current `milestones`, `task_progress`, and `user_progress` rows. Migration must preserve their progress state.
**Mitigation:** Migration script creates PlanNodes from existing milestone_lessons + task_progress. `PlanNode.status` is derived from `task_progress.status` and `user_progress.completed`. Active plans are migrated to new schema with `status = 'active'`. Learners see their progress preserved. No plan restart required.

### Risk 7: Admin tooling gap
**Risk:** Current Admin app (`apps/admin`) has lesson forms, analytics tables, and sync scripts built around the track + course model. All must be updated.
**Mitigation:** Admin migration is a separate work stream. Phase 1 operates with both old and new admin interfaces. New admin provides: lesson version editor (block-based), capability manager, domain manager, TrackView curator. Old admin remains functional for read operations during transition.

### Risk 8: Increased DB query complexity
**Risk:** More tables (21 new) means more joins. Current TS-based lookup is O(1) in-memory; DB-based lookup involves network round-trips.
**Mitigation:** Aggressive caching at the lesson catalog level (Redis or in-memory with TTL). Lesson content is immutable per version, making it highly cacheable. Plan compilation is an infrequent operation (once per goal, occasionally on revision). Read-heavy paths (lesson display) benefit from CDN-cacheable API responses.

---

## Appendix A: Migration Sequence

The recommended implementation order:

1. **Schema migration** -- Create all new tables alongside existing ones
2. **Content migration** -- Script to convert TS track files -> DB lesson/version/block rows
3. **Capability extraction** -- Derive capabilities from existing tags + outcomes
4. **Plan compiler** -- New goal-to-plan pipeline behind feature flag
5. **Block renderer** -- New LessonBlock-aware content renderer
6. **Evidence system** -- CompetencyAssessment replacing milestone_progress
7. **Graduation rewrite** -- Capability-based graduation
8. **AI prompt updates** -- All 12 flows re-prompted for capability context
9. **TrackView creation** -- Marketing projections of existing tracks
10. **Cleanup** -- Remove TS track files, old tables, feature flags

## Appendix B: Entity Count Estimates (post-migration)

| Entity | Estimated Row Count |
|---|---|
| Domain | 4-8 |
| Capability | 80-200 |
| Lesson | 60-100 (current: ~60 across 4 tracks) |
| LessonVersion | 60-100 (1 version each initially) |
| LessonBlock | 300-600 (5-10 blocks per lesson) |
| LessonObjective | 120-300 (2-3 capabilities per lesson) |
| LessonPrerequisite | 80-150 (from existing prerequisiteIds) |
| ContentTag | 50-100 (from existing tag arrays) |
| TrackView | 4 (current tracks as views) |
