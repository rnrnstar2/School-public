---
name: lesson-critique
description: Produce an independent `Critique` for a saved lesson draft when the next step is risk-finding, not rewriting, and the critique model must differ from the draft model.
license: Proprietary
metadata:
  author: rnrnstar
  version: "0.1.0"
  organization: School
  date: April 2026
  abstract: Runs the critique stage with an explicitly different model from draft and preserves the critique schema and stage boundaries.
---

# Lesson Critique

## Trigger

Use this when a `LessonDraft` JSON exists and the task is to independently review it for schema, pedagogy, execution, and persona-fit issues.

## Prerequisites

- `pnpm` is installed in `/Users/rnrnstar/github/School`.
- Draft JSON already exists.
- The critique adapter must be different from the draft adapter or model family.
- If the flow will later sync to Supabase, bootstrap from `/Users/rnrnstar/github/School/lesson-factory/README.md` still applies.

## References

- Prompt: `/Users/rnrnstar/github/School/lesson-factory/pipelines/critique/PROMPT.md`
- Critique schema: `/Users/rnrnstar/github/School/lesson-factory/schemas/critique.schema.json`
- Boundaries: `/Users/rnrnstar/github/School/lesson-factory/pipelines/README.md`

## Commands

```bash
pnpm --filter @school/lesson-factory lesson:critique <draft.json> --adapter gemini
```

## Inputs

- Draft artifact, typically `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-draft.json`

## Outputs

- Critique artifact: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-critique.json`
- Meta path: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-critique.meta.json`
- Error path: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-critique-error.json`

## Workflow

1. Read the critique prompt and schema.
2. Confirm which adapter or model produced the draft.
3. Run critique with a different adapter or model. Default recommendation: `--adapter gemini`.
4. Return only the `Critique` object.
5. Sort issues by severity and keep locations traceable.

## Constraints

- `critique` is problem-finding only. Do not generate revised YAML, revised markdown, or auto-fixes.
- `critique` must use a different model from `draft`.
- Do not use `pnpm --filter @school/lesson-factory lesson:run` for production critique because it threads one adapter choice through both draft and critique.
- If there is a major schema break or execution blocker, prefer `revise` or `block`; do not inflate scores.
- The lesson must stay within the owner-local pipeline boundary.
