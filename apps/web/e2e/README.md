# E2E Test Helpers

This directory hosts the Playwright suite. After the **P3-4** refactor the
helpers are split into focused modules that separate AI mocking from real
Supabase interaction.

## Directory layout

```
e2e/
├── helpers/
│   ├── index.ts        # public barrel — new specs should import from here
│   ├── mock-ai.ts      # AI mocks (hearing, lesson chat, plan review, verify)
│   ├── auth.ts         # mockSupabaseAuth + loginAsTestUser
│   └── db.ts           # admin client + seed / reset helpers
├── helpers.ts          # LEGACY barrel — re-exports from helpers/* for back-compat
├── track-helpers.ts    # track-specific helpers (used by four-tracks.spec.ts)
├── global-setup.ts     # once-per-run DB seed
├── global-teardown.ts  # once-per-run DB cleanup
├── *.spec.ts           # Playwright specs
└── README.md           # (this file)
```

## Mocked vs real surfaces

| Surface                                    | Strategy          | Why                                                      |
| ------------------------------------------ | ----------------- | -------------------------------------------------------- |
| `/api/planner/hearing` (SSE)               | **Mocked**        | Real AI is flaky, slow, expensive, non-deterministic     |
| `/api/lessons/:id/chat` (SSE)              | **Mocked**        | Same                                                     |
| `/api/planner/plan-review` (SSE)           | **Mocked**        | Same                                                     |
| `/api/artifacts/verify` (AI-driven)        | **Mocked**        | Verification uses an LLM; keep deterministic             |
| `/api/planner/recommendation`              | Mocked (legacy)   | Wraps planner adapter; migration target                  |
| `/api/learner/resume`                      | Mocked (legacy)   | Should hit real Supabase after migration                 |
| `/api/artifacts` (GET/POST)                | Mocked (legacy)   | Should hit real Supabase after migration                 |
| Supabase `auth.users` session cookies      | **Real** when local stack is up, else mock | Exercises real RLS                            |
| Supabase `public.*` REST queries           | **Real** when local stack is up, else mock | Exercises real queries                       |
| Sentry / PostHog / Upstash                 | No-op / ignored   | External services — never called from E2E               |

The new modular helpers (`helpers/*`) explicitly follow the table above. The
legacy helpers (`helpers.ts`'s `setupCoreMocks`, `setupResumeMocks`, etc.)
continue to mock everything and remain in place so the existing specs don't
regress. They can be migrated one spec at a time.

## Running

### Mocks-only mode (no local Supabase required)

```bash
cd apps/web
pnpm test:e2e
```

All legacy specs work without any external services. `smoke-real-db.spec.ts`
auto-falls-back to `mockSupabaseAuth` when the local stack is unreachable.

### Real-DB mode

Start the local Supabase stack first, then run Playwright. The migrations +
`seed.sql` populate the deterministic catalog, and `global-setup.ts` seeds a
dedicated `e2e-test@school.local` user + baseline learner state.

```bash
cd apps/web
# 1. Start local Supabase (auto-applies migrations + seed.sql)
pnpm exec supabase start   # or: supabase start

# 2. (Optional) Override the stack location:
#    export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54341
#    export SUPABASE_SERVICE_ROLE_KEY=<your-local-service-role-key>

# 3. Run the suite
pnpm test:e2e
```

The test user credentials are:

```
email:    e2e-test@school.local
password: e2e-test-password-!@#
user_id:  00000000-0000-4000-8000-00000000e2e0
```

Do not use these on a real production database.

## Writing a new spec

```ts
import { test, expect } from '@playwright/test'
import { mockAiResponses, loginAsTestUser, mockSupabaseAuth, ensureTestUser } from './helpers/index'

test.beforeEach(async ({ page }) => {
  await mockAiResponses(page)
  const user = await ensureTestUser()
  if (user) {
    await loginAsTestUser(page)
  } else {
    await mockSupabaseAuth(page)
  }
})
```

See `smoke-real-db.spec.ts` for a complete reference implementation.

## Migrating a legacy spec

1. Replace `setupCoreMocks(page)` with the pair above (`mockAiResponses` +
   auth strategy).
2. Remove per-route `page.route('**/api/...')` overrides that are now covered
   by the real DB via `global-setup.ts` seeding.
3. Guard real-DB assertions with `test.skip(!isLocalSupabaseReady(), ...)` so
   the spec still runs in mocks-only mode.
4. Keep AI endpoint mocks — those should stay mocked forever.

## Journey-reports 保存規約 (TQ-119)

Persona 系 spec (`e2e/personas/*.spec.ts`) は `recorder.finish()` 直後に
`appendJourneyReport(persona, spec, report, project?, shardInfo?)` を呼び、結果を
ファイルに永続化する。その出力は `/dev/journeys` ダッシュボードが列挙する。

- **出力ルート**: `apps/web/playwright-report/journey-reports/`
- **アーカイブルート**: `apps/web/playwright-report/journey-reports/archive/`
- **ファイル名**: `<personaId>-<ISO8601>-<shard>.json`
  - ISO8601 は `YYYYMMDDTHHMMSSsssZ` 形式（コロン/ハイフン/ドットを除去した圧縮表現）。
  - `<shard>` は Playwright `--shard=N/M` 指定時は `NofM`、未指定時は `w<workerIndex>-p<pid>`。
- **JSON 形状** (`schemaVersion: 1`):
  ```jsonc
  {
    "schemaVersion": 1,
    "shard": "1of2",           // shardSlug()
    "shardIndex": 1,            // null if not sharded
    "shardTotal": 2,            // null if not sharded
    "workerIndex": 0,           // Playwright TEST_WORKER_INDEX
    "pid": 12345,
    "recordedAt": "2026-04-16T12:34:56.789Z",
    "reports": [ /* PersistedJourneyReport[] — 既存 shape は一切変えない */ ]
  }
  ```
- **後方互換**: `/dev/journeys` のリーダーは (a) 新 object フォーマット、(b) flat array、
  (c) 旧 `<pid>.json` shard のいずれもパースする。writer は新規書き込み時は常に (a) を吐く。
- **Shard 検出優先度**: `shardInfo` 引数 → `PLAYWRIGHT_SHARD_CURRENT` /
  `PLAYWRIGHT_SHARD_TOTAL` env → null (fallback to worker slug)。
- **ローテーション**: `node scripts/swarm/rotate-journey-reports.mjs --keep N [--dry-run]`
  で最新 N 件以外を `archive/` に退避する。CI は現状ローテーションを自動適用しない
  (必要に応じて owner が叩く)。

新しい spec で書き込みを増やす場合も、この writer を通す限りファイル命名は自動で
shard 間衝突を避ける（ファイル名に ISO8601 が含まれるため）。

## Troubleshooting

- **`listUsers failed`** in the global-setup log → the local Supabase stack is
  not running or the service role key is wrong. The suite will continue in
  mocks-only mode.
- **Port mismatches** → `playwright.config.ts` now reads the port from
  `PLAYWRIGHT_WEB_PORT` (defaults to `3200` matching `next dev --port 3200`).
  The Supabase URL is read from `NEXT_PUBLIC_SUPABASE_URL` (defaults to
  `http://localhost:54341` matching `supabase/config.toml`).
