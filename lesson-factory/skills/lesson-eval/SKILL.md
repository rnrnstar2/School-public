---
name: lesson-eval
description: Run the four lesson-factory evaluations on a saved draft and critique bundle when the goal is a publish gate, with the rule that any failing dimension blocks publish.
license: Proprietary
metadata:
  author: rnrnstar
  version: "0.1.0"
  organization: School
  date: April 2026
  abstract: Runs schema, pedagogy, execution, and persona-simulation evaluation and treats any failure as a hard stop for publish.
---

# Lesson Eval

## Trigger

Use this when draft and critique artifacts already exist and the next question is whether the lesson can advance to publish review.

## Prerequisites

- `pnpm` is installed in `/Users/rnrnstar/github/School`.
- Draft JSON and critique JSON already exist.
- Rubrics and personas are present under `/Users/rnrnstar/github/School/lesson-factory/evals/`.
- Supabase bootstrap is not required for eval itself, but it is still required before later `lesson:sync`.

## References

- Prompt: `/Users/rnrnstar/github/School/lesson-factory/pipelines/eval/PROMPT.md`
- Rubrics: `/Users/rnrnstar/github/School/lesson-factory/evals/rubrics/baseline.yaml`
- Rubrics: `/Users/rnrnstar/github/School/lesson-factory/evals/rubrics/pedagogy.rubric.yaml`
- Rubrics: `/Users/rnrnstar/github/School/lesson-factory/evals/rubrics/execution.rubric.yaml`
- Rubrics: `/Users/rnrnstar/github/School/lesson-factory/evals/rubrics/persona-fit.rubric.yaml`
- Personas: `/Users/rnrnstar/github/School/lesson-factory/evals/personas/`
- Boundaries: `/Users/rnrnstar/github/School/lesson-factory/pipelines/README.md`

## Commands

```bash
pnpm --filter @school/lesson-factory lesson:eval <draft.json> <critique.json>
```

## Inputs

- Draft artifact: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-draft.json`
- Critique artifact: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-critique.json`

## Outputs

- Eval bundle: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-eval.json`
- Meta path: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-eval.meta.json`
- Error path: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-eval-error.json`

## Workflow

1. Read the eval prompt and rubric files.
2. Run all four evaluations: `schema_eval`, `pedagogy_eval`, `execution_eval`, `persona_simulation`.
3. Treat any `fail` as a hard stop. Do not publish.
4. Only treat `reviewed_candidate` as publish-ready.

## Constraints

- Any single eval failure means `DO NOT publish`.
- `reviewed_candidate` is only a review gate; it does not mean `stable`.
- Do not invent missing inputs. Missing assets, rubric data, or mismatched lesson IDs should fail the relevant dimension.
- Fill all four eval sections. Do not leave blank sections and still call the result pass.

## Notes

- The current CLI accepts only draft and critique paths. It does not take an asset bundle path, so drafts with non-empty `media_slots` can fail schema eval unless assets are wired in by code changes or the draft avoids media requirements.
