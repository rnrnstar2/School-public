# School Curriculum Architecture v1

## 1. Purpose

This architecture defines how School should model, store, sequence, and expand curriculum for learners who want a real outcome, not passive content consumption.

The first target track is:

- Build and deploy a real website using AI
- Tech stack: Next.js, Vercel, Supabase, Tailwind CSS, shadcn/ui
- End state: the learner ships a live URL they can open and share

The core design requirement is modularity. Lessons must be small, well-described, and dependency-aware so AI can:

- discover the right lessons for a learner's goal
- sequence them according to prerequisites and skill level
- skip unnecessary lessons
- recombine lessons into new tracks later

## 2. Target Persona And Promise

### Persona

Primary learner:

- wants to build something real quickly
- is motivated by shipping a website, not by abstract computer science
- is comfortable using AI tools but may not fully understand the web stack
- may be a beginner or light intermediate developer
- wants practical guidance, copyable workflows, and clear checkpoints

### Promise

School should be able to say:

> Start with an idea, use AI effectively, build a working Next.js site with Supabase and polished UI, deploy it to Vercel, and leave with a live product plus the understanding needed to keep improving it.

### Non-goals For v1

- deep computer science theory
- broad framework surveys
- highly specialized backend architecture
- enterprise-scale DevOps

## 3. Graduation Criteria

A learner is considered complete for this track when all of the following are true:

1. They have a working Next.js application in a Git repository.
2. The application uses Tailwind CSS and shadcn/ui for presentable UI composition.
3. The application is connected to Supabase for at least one real data or auth workflow.
4. The project is deployed to Vercel.
5. A live URL is accessible from a public browser session.
6. The learner can explain the purpose of each core service in their stack:
   - Next.js
   - Vercel
   - Supabase
   - Tailwind CSS
   - shadcn/ui
7. The learner has completed a capstone delivery checklist:
   - local development works
   - environment variables are configured
   - production deployment succeeds
   - at least one user-facing flow is demonstrably functional

## 4. Design Principles

### Modular over monolithic

Lessons should be atomic enough to mix and match across tracks.

### Outcome-first

Every lesson must change what the learner can do, not just what they know.

### Retrieval-friendly

Metadata must make each lesson easy for AI to find based on goal, stack, skill level, blockers, and dependencies.

### Authoring consistency

A reusable lesson shape is more important than perfect custom formatting.

### Progressive complexity

Tracks should support beginners without forcing intermediates to repeat setup fundamentals they already know.

## 5. Curriculum Object Model

The curriculum system should use five layers.

### Track

A track is a guided path toward a concrete end state.

Examples:

- `web-builder-ai`
- future: `ai-automation-builder`
- future: `portfolio-site-designer`

### Module

A module is a coherent phase of work inside a track.

Examples:

- foundation and setup
- UI construction
- data and auth
- deployment and polish

### Lesson Chunk

A lesson chunk is the core atomic learning unit and the main retrieval object for AI sequencing.

It should be completable in one focused session.

### Project Milestone

A milestone groups multiple lesson chunks around a visible product outcome.

Examples:

- local app running
- UI shell built
- database-backed feature working
- site deployed

### Support Asset

Reusable helpers that can be attached to lessons:

- glossary
- troubleshooting guide
- checklist
- prompt pack
- rubric
- starter template

Support assets should be referenced by lessons, not duplicated into them.

## 6. Lesson Granularity Rules

Lesson chunk size is critical. If lessons are too large, AI cannot recombine them reliably. If too small, the track becomes noisy.

Rules for a valid lesson chunk:

1. One lesson chunk should teach one capability or one tightly-coupled workflow.
2. Target completion time: 20 to 45 minutes.
3. A chunk should produce one observable output:
   - repository initialized
   - route created
   - component added
   - Supabase project connected
   - deployment completed
4. A chunk may have multiple steps, but only one primary learning objective.
5. A chunk should not require more than 3 direct prerequisites.
6. If a lesson has two separate failure modes or two different personas would skip different halves of it, split it.
7. Troubleshooting-heavy material should usually be a support asset, not a core lesson.

Heuristic:

- if the title needs "and", it may be too large
- if the learner cannot tell whether they completed it, it is too vague
- if removing the lesson breaks multiple distant lessons, it is probably too broad

## 7. Canonical Lesson Metadata Schema

Each lesson chunk should be stored with structured metadata optimized for AI retrieval and recombination.

Recommended schema:

```yaml
id: lesson_web_builder_020_create_next_app
title: Create the Next.js project
track_id: web-builder-ai
module_id: foundation-setup
version: 1
status: draft
summary: Initialize the project, run it locally, and understand the generated structure.
promise: You will have a running Next.js app ready for the rest of the track.
skill_level:
  min: beginner
  recommended: beginner
  max: intermediate
estimated_minutes: 30
lesson_type: build
delivery_mode: guided
primary_outcome: local_next_app_running
outputs:
  - local dev server runs
  - repo contains baseline app structure
prerequisite_ids:
  - lesson_web_builder_010_choose_project_goal
recommended_before_ids: []
unlocks:
  - lesson_web_builder_030_publish_repo
  - lesson_web_builder_040_install_tailwind_and_shadcn
stack:
  frameworks: [nextjs]
  backend: []
  database: []
  styling: [tailwindcss]
  ui: []
  hosting: []
  tooling: [git, ai-coding-assistant]
persona_tags:
  - beginner-builder
  - ai-assisted-maker
goal_tags:
  - build-first-app
  - start-project
capability_tags:
  - project-initialization
  - local-development
search_terms:
  - create next.js app
  - start nextjs project
  - run dev server
blocker_tags:
  - node-not-installed
  - pnpm-missing
  - port-conflict
artifact_refs:
  - starter-checklist-next-app
assessment:
  type: completion_check
  rubric:
    - app runs locally
    - learner can identify src/app/page.tsx
ai_adaptation:
  can_skip_if:
    - learner already has a working Next.js repo
  remediate_with:
    - support_env_setup_node
    - support_git_basics
  accelerate_to:
    - lesson_web_builder_040_install_tailwind_and_shadcn
authoring_contract:
  required_sections:
    - why_this_matters
    - do_the_work
    - verify
    - common_failures
    - next_step
```

### Required Metadata Fields

Every lesson chunk must include:

- `id`
- `title`
- `track_id`
- `module_id`
- `summary`
- `promise`
- `estimated_minutes`
- `primary_outcome`
- `prerequisite_ids`
- `stack`
- `goal_tags`
- `capability_tags`
- `blocker_tags`
- `assessment`
- `ai_adaptation`

### Why This Schema Works For AI

- `goal_tags` align lessons to user intent
- `capability_tags` support skills-based retrieval
- `blocker_tags` help the system route stuck learners
- `prerequisite_ids` make sequencing explicit
- `can_skip_if` and `accelerate_to` support adaptive paths
- `stack` enables track recombination across technologies

## 8. Lesson Page Authoring Contract

Every lesson page should follow the same structure:

1. `Why this matters`
2. `What you will build or change`
3. `Prerequisites`
4. `Do the work`
5. `Verify`
6. `Common failures`
7. `Use AI well`
8. `Next step`

This contract keeps lesson quality consistent and makes content easier to generate, review, and transform later.

Recommended lesson body constraints:

- lead with the concrete outcome
- include at least one verification checkpoint
- include at least one AI usage pattern and one caution
- link to support assets instead of embedding long reference material

## 9. Dependency Model

The prerequisite system should be a directed acyclic graph at the lesson chunk level.

### Dependency Types

Use three dependency strengths:

1. `hard_prerequisite`
   The learner is likely blocked without it.
2. `recommended_before`
   The learner can continue, but quality or speed will drop.
3. `mutually_reinforcing`
   Lessons can be taken in either order, but pairing is beneficial.

For system simplicity, only `hard_prerequisite` should gate automated sequencing in v1. The other two types should inform recommendation ranking only.

### Graph Rules

- no cycles
- a lesson should usually have 0 to 3 hard prerequisites
- milestone lessons may depend on several prior chunks
- support assets do not sit in the main prerequisite graph

### Suggested v1 Graph Shape For The First Track

1. project goal and scope
2. local setup and repository creation
3. UI foundation
4. data and auth integration
5. deployment
6. post-deploy polish

This keeps the graph shallow enough for AI sequencing while still supporting skip logic for experienced users.

## 10. Recommended Lesson Chunks For The First Track

These chunk categories should be present in the first release:

### Module A: Project Framing

- choose a realistic site idea
- define the MVP pages and core user flow
- set up the working repo and project board

### Module B: Local Foundation

- create the Next.js app
- understand the project structure
- install and verify Tailwind CSS
- install and configure shadcn/ui

### Module C: UI Build

- create the app shell and navigation
- build the homepage
- build a second content or dashboard page
- turn rough UI into a consistent design system

### Module D: Supabase Integration

- create the Supabase project
- connect env vars locally
- design the first data model
- read and write data from the app
- optionally add auth

### Module E: Production Readiness

- prepare environment variables for Vercel
- deploy the app
- verify the live site
- fix first-production issues

### Module F: Finish And Reflect

- add one polish improvement
- run a final launch checklist
- document what was built and what to improve next

## 11. AI Sequencing Strategy

AI should propose lesson ordering based on:

- user goal
- current skill level
- current project state
- declared blockers
- preferred pace

### Inputs To Collect

Minimum learner state for sequencing:

- target outcome
- beginner / intermediate / advanced self-rating
- whether they already have:
  - Node and package manager installed
  - a Git repository
  - a Next.js app
  - a Supabase project
  - a Vercel account
- whether they want:
  - a content site
  - an authenticated app
  - a database-backed app

### Ordering Logic

1. Filter lessons by selected track.
2. Remove lessons whose outcomes the learner already has evidence for.
3. Expand all hard prerequisites of the remaining lessons.
4. Sort by graph order.
5. Re-rank adjacent lessons based on learner goal:
   - content-site learners can defer auth
   - app builders should prioritize data model and auth earlier
6. Insert remediation lessons when blocker tags match learner state.
7. Group the final result into short near-term milestones, not one long sequence.

### Sequencing Modes

- `guided_path`
  Best for beginners. Strict milestone order.
- `adaptive_path`
  Best for mixed-skill learners. Skip fundamentals when proven.
- `sprint_path`
  Best for experienced builders. Focus on build, deploy, then patch gaps.

### AI Output Format Recommendation

When proposing an order, AI should provide:

- why this sequence fits the learner
- the next 3 to 5 lessons only
- what was intentionally skipped
- which lesson unlocks the first live demo

This avoids overwhelming the learner and keeps sequencing explainable.

## 12. First Track Recommendation

The first production track should be:

- `web-builder-ai`
- label: `Build and Deploy a Real Website with AI`

Why this track should launch first:

- direct, visible outcome
- strong fit for existing repo technology
- easy to market
- rich opportunity for reusable lessons across future coding tracks

## 13. Adding Future Personas And Tracks

Future tracks should reuse the same lesson chunk system, not introduce a second curriculum model.

### Track Creation Rules

Every new track must define:

- persona
- promise
- graduation criteria
- module map
- lesson chunk list
- prerequisite graph
- unique goal tags
- shared capability tags where possible

### Reuse Strategy

Reuse existing lessons when the capability is unchanged.

Examples:

- `deploy to vercel` can be reused across multiple web tracks
- `set environment variables safely` can be reused across app and automation tracks
- `define MVP scope` can be reused across nearly all build-oriented personas

Fork a lesson only when one of these is true:

- the stack materially changes
- the learner goal materially changes
- the proof of completion changes

### Future Persona Examples

- non-technical founder building an MVP with AI
- designer building a portfolio site with AI
- freelancer building client websites faster with AI
- beginner developer learning full-stack fundamentals through shipping

## 14. Implementation Guidance For School

To support this architecture, the content system should eventually model:

- tracks
- modules
- lessons
- support assets
- lesson dependencies
- lesson tags
- learner progress state

Recommended implementation order:

1. finalize schema and content templates
2. author first track outline
3. build admin support for lesson metadata and dependency entry
4. build AI retrieval/sequencing logic on top of metadata
5. add progress and adaptive recommendation loops

## 15. Success Metrics For v1

The curriculum architecture is working if:

- content authors can add lessons without redefining the system
- AI can recommend a short sequence without manual curation
- beginner and intermediate learners receive different lesson plans
- at least 70 percent of lessons are reusable by a second track
- learners consistently reach a live deployed URL

## 16. Decisions Locked By This Spec

- the lesson chunk is the primary atomic unit
- sequencing is graph-based, not only linear
- metadata is designed for AI retrieval from day one
- support assets are separate reusable objects
- the first track optimizes for shipping a live site, not broad theory coverage
