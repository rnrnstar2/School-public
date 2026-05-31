# Planner Adapter Notes

## Current MVP behavior

- Homepage and plan page accept a freeform Japanese goal.
- The planner currently supports one intent reliably: wanting to build a website.
- Website-like goals route to the website learning plan.
- Other goals return a polished `準備中` response instead of pretending support.

## Adapter structure

- API route: `src/app/api/planner/recommendation/route.ts`
- Server adapter factory: `src/lib/planner/server.ts`
- Mock adapter: `src/lib/planner/adapters/mock-planner.ts`
- External adapter placeholder: `src/lib/planner/adapters/zai-planner.ts`

## Optional future env vars

```bash
ZAI_CODING_PLAN_API_URL=
ZAI_PLANNER_API_URL=
ZAI_PLANNER_API_KEY=
ZAI_API_KEY=
ZAI_PLANNER_MODEL=glm-5
```

`ZAI_PLANNER_API_KEY` is preferred, but the legacy `ZAI_API_KEY` is also accepted. `ZAI_CODING_PLAN_API_URL` is preferred for the live conversation planner and plan generation path, with `ZAI_PLANNER_API_URL` kept as a compatibility fallback. If no custom URL is provided, the server uses the default ZAI coding endpoint: `https://api.z.ai/api/coding/paas/v4/chat/completions`. The live hearing step extracts structured `buildGoal / constraints / preferences / planningFocus` intent and passes it into lesson selection and plan generation before the mentor workspace is rendered. On failure, the UI shows the fallback reason and returns a local deterministic recommendation.

## Expected external request shape

```json
{
  "model": "glm-5",
  "temperature": 0.3,
  "messages": [
    {
      "role": "system",
      "content": "Return planner JSON in Japanese."
    },
    {
      "role": "user",
      "content": "学習者の相談: ポートフォリオサイトを作りたい"
    }
  ]
}
```

The external response is treated as OpenAI-compatible `chat.completions`. The adapter first looks for `choices[0].message.content`, attempts to parse JSON from that text, and falls back to rendering the returned freeform text if the exact shape is uncertain.
