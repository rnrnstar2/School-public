---
name: lesson-intake
description: Normalize a free-form owner request into a lesson-factory intake bundle YAML when the user needs `new_atom` vs `improve_existing` vs `anchor_only` vs `unsupported` classification without drafting lesson content yet.
license: Proprietary
metadata:
  author: rnrnstar
  version: "0.1.0"
  organization: School
  date: April 2026
  abstract: Produces a valid owner-local intake bundle for lesson-factory and preserves the run-log filename convention used by the pipeline.
---

# Lesson Intake

## Trigger

Use this when the user gives free-form Owner notes and wants a normalized intake bundle for `lesson-factory`, not a lesson draft yet.

## Prerequisites

- `pnpm` is available in `/Users/rnrnstar/github/School`.
- Existing atoms are discoverable under `/Users/rnrnstar/github/School/lesson-factory/lessons/atoms/`.
- If the work will later continue to `lesson:sync`, finish `/Users/rnrnstar/github/School/lesson-factory/README.md` bootstrap first: export `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run `bash lesson-factory/scripts/bootstrap.sh`.
- `GEMINI_API_KEY` is not required for intake.

## References

- Prompt: `/Users/rnrnstar/github/School/lesson-factory/pipelines/intake/PROMPT.md`
- Boundaries: `/Users/rnrnstar/github/School/lesson-factory/pipelines/README.md`
- Example chain: `/Users/rnrnstar/github/School/lesson-factory/pipelines/EXAMPLE_RUN.md`
- Output convention: `/Users/rnrnstar/github/School/lesson-factory/src/core/run-log.ts`

## Commands

```bash
pnpm --filter @school/lesson-factory lesson:list
# No public lesson:intake CLI exists yet.
pnpm --filter @school/lesson-factory lesson:draft /Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-intake.yaml
```

## Inputs

- Free-form Owner request.
- Relevant existing atoms from `lesson:list` and `/Users/rnrnstar/github/School/lesson-factory/lessons/atoms/*.yaml`.
- Candidate freshness sources.

## Outputs

- Main bundle: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-intake.yaml`
- Meta path if internal pipeline is used: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-intake.meta.json`
- Error path if internal pipeline fails: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-intake-error.json`
- If `classification: unsupported`, also append `/Users/rnrnstar/github/School/lesson-factory/logs/unsupported-goals/unsupported-goals.jsonl`

## Workflow

1. Read the prompt file before normalizing anything.
2. Extract `goal.summary`, `constraints`, and `hints`.
3. Select 1-3 `target_personas` with concrete reasons.
4. Choose one `classification`: `new_atom`, `improve_existing`, `anchor_only`, or `unsupported`.
5. Populate `related_atom_ids` whenever the request maps to existing atoms.
6. Save only the intake YAML and stop there.

## Constraints

- `intake` is classification only. Do not write `lesson_yaml`, `body_markdown`, media briefs, or publish decisions.
- Only continue to `draft` when `classification` is `new_atom` or `improve_existing`.
- Treat ADR-0006 violations, unattended publish, server-side automation, and auto-stable promotion as `unsupported`.
- Keep one Atom centered on one capability. If the request spans multiple capabilities, prefer `anchor_only` or `unsupported`.
- Link to the prompt file; do not duplicate large prompt text.
