---
name: lesson-media
description: Generate lesson image assets from approved `media_slots` and `image_briefs` when the draft has passed critique and the next step is tracked local asset creation, not publishing.
license: Proprietary
metadata:
  author: rnrnstar
  version: "0.1.0"
  organization: School
  date: April 2026
  abstract: Runs the media stage against a saved lesson draft using the Owner's Codex/ChatGPT subscription image generation flow, without requiring OpenAI API keys.
---

# Lesson Media

## Trigger

Use this when a critique-approved draft has `media_slots` and `image_briefs`, and the task is to materialize tracked local image assets.

## Prerequisites

- `pnpm` is installed in `/Users/rnrnstar/github/School`.
- Draft JSON already exists and its briefs are approved.
- Real image generation uses Codex/ChatGPT built-in imagegen from the signed-in subscription plan.
- Do not use `OPENAI_API_KEY`, Image API, or the `imagegen` fallback CLI for the standard School lesson media flow.
- The legacy automated `lesson:media` command still exists for Nano Banana/stub compatibility, but it is not the preferred subscription path.
- Supabase bootstrap is not required for media itself, but it is still required before a later `lesson:sync`.

## References

- Prompt: `/Users/rnrnstar/github/School/lesson-factory/pipelines/media/PROMPT.md`
- Asset schema: `/Users/rnrnstar/github/School/lesson-factory/schemas/asset.schema.json`
- Boundaries: `/Users/rnrnstar/github/School/lesson-factory/pipelines/README.md`

## Commands

```bash
pnpm --filter @school/lesson-factory lesson:media:queue <draft.json>
pnpm --filter @school/lesson-factory lesson:media:import <queue.json>
```

## Inputs

- Draft artifact, typically `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-draft.json`

## Outputs

- Asset bundle: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-media.json`
- Imagegen queue: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-media-imagegen-queue.json`
- Prompt guide: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-media-imagegen-guide.md`
- Meta path: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-media.meta.json`
- Error path: `/Users/rnrnstar/github/School/lesson-factory/logs/runs/<timestamp>-media-error.json`
- Subscription-generated PNGs land under `/Users/rnrnstar/github/School/lesson-factory/assets/images/<lesson_id>/<slot>.png`
- Runtime copies land under `/Users/rnrnstar/github/School/apps/web/public/lesson-assets/<lesson_id>/<slot>.png`

## Workflow

1. Read the media prompt.
2. Run `lesson:media:queue` against the approved draft.
3. Use Codex/ChatGPT built-in imagegen for each queue job prompt. Do not use API keys.
4. Save each selected PNG to its `target_file_path`.
5. Run `lesson:media:import` against the queue JSON and treat the returned `Asset[]` as the source of truth.
6. Match each brief to an existing `media_slot`. Do not invent new slot names.
7. Keep video out of scope for this skill.

## Constraints

- `media` stops at asset creation. Do not publish, sync, or register assets in delivery systems.
- Only approved briefs should be turned into assets.
- Slot names are fixed by `lesson_yaml.media_slots`; do not rename them.
- The generated queue and final imported `Asset[]` remain the source of truth. Do not mark unsaved ChatGPT/Codex previews as complete.
- Video is out of scope here. If `video_briefs` exist, treat any stub video output as non-production.
