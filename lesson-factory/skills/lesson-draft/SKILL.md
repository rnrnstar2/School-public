---
name: lesson-draft
description: Generate a `LessonDraft` JSON from an intake bundle when the request has already been classified as `new_atom` or `improve_existing` and the next step is an owner-reviewable first draft.
license: Proprietary
metadata:
  author: rnrnstar
  version: "0.1.0"
  organization: School
  date: April 2026
  abstract: Runs the draft stage for lesson-factory and keeps output aligned with the draft schema and run-log artifact paths.
---

# Lesson Draft

## Trigger

Use this when a valid intake bundle already exists and the user wants the first `LessonDraft` artifact.

## Prerequisites

- `pnpm` is installed in `/Users/rnrnstar/github/School`.
- Input intake YAML already exists and was classified as `new_atom` or `improve_existing`.
- If the flow will later end in `lesson:sync`, complete the bootstrap in `/Users/rnrnstar/github/School/lesson-factory/README.md` first.
- `GEMINI_API_KEY` is not required unless the chosen adapter later depends on it.

## References

- Prompt: `/Users/rnrnstar/github/School/lesson-factory/pipelines/draft/PROMPT.md`
- Draft schema: `/Users/rnrnstar/github/School/lesson-factory/schemas/lesson-draft.schema.json`
- Lesson schema: `/Users/rnrnstar/github/School/lesson-factory/schemas/lesson.schema.json`
- Boundaries: `/Users/rnrnstar/github/School/lesson-factory/pipelines/README.md`

## Commands

```bash
pnpm --filter @school/lesson-factory lesson:draft <intake-bundle.yaml>
pnpm --filter @school/lesson-factory lesson:draft <intake-bundle.yaml> --adapter claude-code
```

## Inputs

- Intake bundle YAML, typically `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-intake.yaml`
- Related atom YAML from `/Users/rnrnstar/github/School/lesson-factory/lessons/atoms/<id>.yaml` when improving an existing lesson

## Outputs

- Draft artifact: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-draft.json`
- Meta path: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-draft.meta.json`
- Error path: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-draft-error.json`

## Workflow

1. Read the draft prompt and both schemas.
2. Refuse to proceed if the intake classification is `anchor_only` or `unsupported`.
3. Generate exactly one `LessonDraft`.
4. Keep `lesson_yaml` schema-valid and `status: draft`.
5. Keep `image_briefs` and `video_briefs` as briefs only. Do not claim files exist.
6. Hand the saved JSON to `lesson-critique`.

## Constraints

- `draft` is first-draft only. Do not make publish decisions or generate media files here.
- Follow `lesson-draft.schema.json` exactly and keep `lesson_yaml` valid against `lesson.schema.json`.
- Keep the lesson scoped to one capability; do not widen the atom boundary to absorb multiple jobs.
- Continue only from `new_atom` or `improve_existing`.
- Owner-local execution only. No server-run or unattended publish language.
