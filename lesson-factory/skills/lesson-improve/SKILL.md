---
name: lesson-improve
description: Guide the full lesson-factory improvement loop for an existing atom when the user wants the end-to-end owner-local workflow from selecting an atom through manual version promotion.
license: Proprietary
metadata:
  author: rnrnstar
  version: "0.1.0"
  organization: School
  date: April 2026
  abstract: Orchestrates the lesson-factory improvement loop by chaining lesson-intake, lesson-draft, lesson-critique, lesson-media, lesson-eval, and lesson-publish around the current manual edit workflow.
---

# Lesson Improve

## Trigger

Use this when the user wants the full owner-local improvement loop for an existing lesson atom, not a single stage in isolation.

## Prerequisites

- `pnpm` is installed in `/Users/rnrnstar/github/School`.
- Supabase bootstrap from `/Users/rnrnstar/github/School/lesson-factory/README.md` is complete before `lesson:sync`.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are exported before `lesson:sync`.
- Real images in `lesson-media` use the Owner's Codex/ChatGPT subscription built-in imagegen flow; do not require `OPENAI_API_KEY`.
- There is no public `lesson:improve` CLI yet. This skill is the orchestrator.

## References

- Improvement loop: `/Users/rnrnstar/github/School/lesson-factory/README.md`
- Boundaries and chain rules: `/Users/rnrnstar/github/School/lesson-factory/pipelines/README.md`
- Example chain: `/Users/rnrnstar/github/School/lesson-factory/pipelines/EXAMPLE_RUN.md`

## Commands

```bash
pnpm --filter @school/lesson-factory lesson:list
pnpm --filter @school/lesson-factory lesson:draft <intake-bundle.yaml>
pnpm --filter @school/lesson-factory lesson:critique <draft.json> --adapter gemini
pnpm --filter @school/lesson-factory lesson:media:queue <draft.json>
pnpm --filter @school/lesson-factory lesson:media:import <queue.json>
pnpm --filter @school/lesson-factory lesson:eval <draft.json> <critique.json>
pnpm --filter @school/lesson-factory lesson:publish <draft.json> <eval-bundle.json>
pnpm --filter @school/lesson-factory lesson:sync
```

## Inputs

- Existing lesson YAML: `/Users/rnrnstar/github/School/lesson-factory/lessons/atoms/<id>.yaml`
- Existing lesson body markdown: `/Users/rnrnstar/github/School/lesson-factory/lessons/atoms/<id>.body.md`
- New owner request or improvement goal

## Outputs

- Intake: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-intake.yaml`
- Draft: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-draft.json`
- Critique: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-critique.json`
- Media: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-media.json`
- Eval: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-eval.json`
- Publish: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-publish.json`
- Sync log: `/Users/rnrnstar/github/School/lesson-factory/logs/sync/<timestamp>.json`

## Sub-skills

- `lesson-intake`
- `lesson-draft`
- `lesson-critique`
- `lesson-media`
- `lesson-eval`
- `lesson-publish`

## Workflow

1. Run `lesson:list` to choose the target atom.
2. Edit `/Users/rnrnstar/github/School/lesson-factory/lessons/atoms/<id>.yaml` and `/Users/rnrnstar/github/School/lesson-factory/lessons/atoms/<id>.body.md` directly when shaping the improvement intent.
3. Produce an intake bundle with `lesson-intake`.
4. Draft with `lesson-draft`.
5. Critique with `lesson-critique`, using a different model than draft.
6. Generate approved media with `lesson-media`.
7. Run `lesson-eval`; if any dimension fails, stop and revise.
8. Publish with `lesson-publish`, then `lesson:sync`.
9. Manually promote in `/admin/atom-versions`. Never skip straight to `stable`.

## Constraints

- Respect every stage boundary; do not collapse intake, critique, eval, and publish into one opaque jump.
- `lesson:run` is not the full workflow. It skips intake, media, publish, and manual promotion, and it can violate the different-model rule for critique.
- Any eval failure blocks publish.
- `stable` must always remain a manual promotion after `reviewed` and `experimental`.
