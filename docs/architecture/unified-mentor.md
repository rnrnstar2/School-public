# Unified Mentor Architecture

> Status: active
> Updated: 2026-04-21

## Goal

School の AI 体験を `hearing` / `mentor chat` / lesson-side chat に分裂させず、
**1人の AI メンター** が **goal 単位の 1 session** を継続管理する構成へ統合する。

この文書は unified mentor 実装の source of truth とし、以後の実装・レビュー・委譲は本書を前提に行う。

## Non-goals

- UI を 1 画面に統合すること
- プラン生成を自由生成 LLM のみで行うこと
- legacy hearing データを移行すること
- AI unavailable 時にローカル fallback で擬似的に前進させること

## Core Model

### Mentor session

- session scope: `user_id + canonical_goal_key`
- `goal_id` は nullable。goal 作成前の intake でも session を開始できる
- canonical goal key は `normalizePlannerGoal(goal)` をベースにする

### Session state

`mentor_sessions` は少なくとも次を保持する。

- `id`
- `user_id`
- `goal_id`
- `goal`
- `canonical_goal_key`
- `messages`
- `history_summary`
- `phase`
- `hearing_answers`
- `hearing_insights`
- `summary_key_points`
- `persona_ids`
- `active_plan_id`
- `current_lesson_id`
- `completed_at`
- `created_at`
- `updated_at`

## Phases

- `discovering`: ゴール把握直後。最初の follow-up を返す
- `clarifying_goal`: audience / deadline / constraints / existing materials などを詰める
- `ready_to_plan`: plan compiler を呼べる情報が揃った状態
- `planning`: compile / recompile 実行中
- `coaching`: 学習相談、プラン調整、lesson context 付き相談
- `executing`: lesson / task 実行中の進行支援
- `stuck`: blocker 解消が主目的の状態
- `reviewing`: artifact / evidence review

初回実装では `discovering` / `clarifying_goal` / `ready_to_plan` / `coaching` を必須とし、
その他は action と context で表現してもよい。

## Prompt policy

- ユーザー向けには常に「同じ AI メンター」が話す
- ただし backend では phase と action に応じて deterministic tool を呼ぶ
- plan compile / recompile は既存 compiler / mentor actions を優先する
- prompt は自然さを優先するが、state 更新は structured output を必須にする
- 定型の相槌、過度な賞賛、goal の言い換えだけの返し、例示列挙の誘導は避ける

## Context source precedence

### Short-term

1. `mentor_session.messages` の recent window
2. `mentor_session.history_summary`
3. current request の `lesson` / `uiContext`

### Long-term

1. `learner_state`
2. `learner_profile`
3. `mentor_memory`
4. `ai_response_feedback`
5. `lesson_feedback`
6. active compiled plan snapshot

### Goal-intake specific

`hearing_answers` / `hearing_insights` / `summary_key_points` / `persona_ids` は
mentor session state の一部として保持し、separate hearing store を持たない。

## Action contract

Unified mentor は少なくとも以下の action を扱う。

- `ask_followup`
- `compile_plan`
- `recompile_plan`
- `focus_lesson`
- `skip_lesson`
- `coach`

プラン変更は自由生成テキストではなく、既存 action 実行系へ委譲する。

## API contract

### `POST /api/mentor/session`

Input:

- `goal`
- `message`
- `sessionId?`
- `lesson?`
- `uiContext?`

Output:

- SSE events: `transport`, `token`, `actions`, `result`, `done`, `error`

### `GET /api/mentor/session`

- goal に紐づく active session を返す

### `DELETE /api/mentor/session`

- goal session を reset する

## Migration policy

- `hearing_chat_messages` は drop 対象
- `planner/hearing*` route 群は削除または `/api/mentor/session` へ統合
- `PlannerHearingSession` は `MentorSessionState` に置き換える
- legacy hearing data は移行しない
- client は full conversation を source of truth として保持しない

## Failure policy

- AI unavailable / timeout / invalid response は explicit error を返す
- local hearing fallback は使わない
- success path は常に live mentor path のみ

## Implementation order

1. architecture doc / task spec を固定
2. `mentor_sessions` migration + typed data access
3. unified session API
4. onboarding caller migration
5. mentor sidebar caller migration
6. lesson-side mentor caller migration
7. legacy cleanup (`planner/hearing*`, `hearing_chat_messages`, unused UI)
