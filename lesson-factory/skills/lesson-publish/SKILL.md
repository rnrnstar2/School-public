---
name: lesson-publish
description: Reflect an eval-approved draft into `lessons/atoms/<id>.yaml`, then sync it to Supabase, when the lesson has already passed eval and the remaining work is controlled owner-confirmed publication prep.
license: Proprietary
metadata:
  author: rnrnstar
  version: "0.1.0"
  organization: School
  date: April 2026
  abstract: Runs the publish stage with explicit owner confirmation, writes the lesson YAML, then syncs the resulting lesson state to the database without auto-promoting to stable.
---

# Lesson Publish

## Trigger

Use this when an eval bundle already says `reviewed_candidate` and the task is to write the lesson YAML, sync it, and stop before manual version promotion.

## Prerequisites

- `pnpm` is installed in `/Users/rnrnstar/github/School`.
- Draft JSON and eval bundle JSON already exist.
- Supabase bootstrap from `/Users/rnrnstar/github/School/lesson-factory/README.md` is complete.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are exported before `lesson:sync`.
- Owner is present to answer the publish confirmation prompt.

## References

- Prompt: `/Users/rnrnstar/github/School/lesson-factory/pipelines/publish/PROMPT.md`
- Boundaries: `/Users/rnrnstar/github/School/lesson-factory/pipelines/README.md`
- Sync CLI: `/Users/rnrnstar/github/School/lesson-factory/src/sync/cli.ts`

## Commands

```bash
pnpm --filter @school/lesson-factory lesson:publish <draft.json> <eval-bundle.json>
pnpm --filter @school/lesson-factory lesson:sync
```

## Inputs

- Draft artifact: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-draft.json`
- Eval bundle: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-eval.json`

## Outputs

- Written lesson YAML: `/Users/rnrnstar/github/School/lesson-factory/lessons/atoms/<lesson_id>.yaml`
- Publish bundle: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-publish.json`
- Publish meta: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-publish.meta.json`
- Publish error: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-publish-error.json`
- Sync log: `/Users/rnrnstar/github/School/lesson-factory/logs/sync/<timestamp>.json`

## Workflow

1. Confirm `eval.recommend_status == reviewed_candidate`.
2. Run `lesson:publish` and explicitly answer `y` to `Owner confirm publish? [y/N]:` only after review.
3. Run `lesson:sync` to push the current lesson state to Supabase.
4. Manually promote versions in `/admin/atom-versions`: `reviewed -> experimental -> stable`.

## Constraints

- If any eval failed, do not publish.
- `publish` only prepares Git-reflectable output and writes the lesson YAML. It is not an unattended release system.
- Suggested statuses are limited to `reviewed` or `experimental`. Never auto-promote to `stable`.
- Owner human review is mandatory.
- `lesson:publish` currently writes `lessons/atoms/<id>.yaml`; it does not write `<id>.body.md`.
