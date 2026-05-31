# Decision Ledger UI-facing RLS 設計スパイク

Status: Draft (spike / 実装・migration apply なし)
Owner: maintainer
Related migrations:
- `apps/web/supabase/migrations/20260416000000_decision_ledger.sql`
- `apps/web/supabase/migrations/20260416120001_lesson_gaps.sql`
- `apps/web/supabase/migrations/20260416180000_lesson_dev_proposals.sql`
- `apps/web/supabase/migrations/20260418093000_goal_node_lesson_matches.sql`
- `apps/web/supabase/migrations/20260418121413_approval_gates_lesson_proposal.sql`

## 1. 背景と現状

`decision_ledger` schema は現在 11 テーブル (goals / goal_nodes / goal_contexts / proposed_actions / schedule_slots / agent_runs / evaluation_runs / approval_gates / lesson_gaps / lesson_dev_proposals / goal_node_lesson_matches) あり、全テーブルに対して RLS は `service_role_all ALL TO service_role USING (true) WITH CHECK (true)` のみ。`anon` / `authenticated` は policy を持たず、schema の GRANT も service_role 限定なので browser から PostgREST 経由では一切触れない。

実コード上の service-role bypass 経路:
- `apps/web/src/lib/supabase/decision-ledger.ts` — `createServiceClient()` を介して全 read/write。`schema('decision_ledger')` を未生成型で cast している (TODO: typegen 再実行)。
- `apps/web/src/app/dev/journeys/approval-inbox/page.tsx` — owner inbox。`requireOwnerRouteUser()` で Supabase SSR の `auth.getUser()` から owner 判定し、その後 `listPendingApprovalGates('lesson_proposal')` と `getLessonDevProposalById()` を service-role 経由で叩く。RLS ではなく application layer で owner 認可している。
- `apps/web/src/app/dev/journeys/approval-inbox/actions.ts` — 承認/却下 action も service-role 経由で `updateApprovalGateDecision()` / `updateLessonDevProposalOwnerReview()` を呼ぶ。
- `apps/web/src/lib/goal-action/{bridge-runner,judge-runner,gap-loop}.ts`、`apps/web/src/lib/planner/goal-tree-shadow.ts`、`apps/web/src/lib/scheduler/admin.ts` — 内部 worker / cron / planner shadow。全て service-role で書き込み、UI に出さない前提。

owner 判定の現行基準 (`apps/web/src/app/api/admin/atom-versions/_server.ts`):
- `app_metadata.role === 'owner'` または `user_metadata.role === 'owner'` で `isOwnerUser()` が true。
- `isAdminUser()` はこれに加え `ADMIN_EMAILS` env の allowlist を参照。現状 owner 側に email allowlist はない。

直接課題: approval_gates / lesson_dev_proposals の owner inbox、および learner 向けの goals / goal_nodes / goal_node_lesson_matches の read を browser からやろうとすると、現行の service-role bypass を web route handler に閉じ込める必要があり、edge / client component / realtime subscription には展開できない。また service-role key が Next.js server 以外へ漏れる将来 (tRPC over WebSocket、mobile app 等) に備えた RLS 原案が必要。

## 2. 設計方針

### 2.1 テーブル 4 分類

| 分類 | テーブル | 利用シーン |
|---|---|---|
| A. owner 限定 read (+limited write) | `approval_gates`, `lesson_dev_proposals`, `lesson_gaps` | owner inbox、lesson 提案承認 UI、gap triage |
| B. learner 自身の read (owner も可) | `goals`, `goal_nodes`, `goal_contexts`, `goal_node_lesson_matches` | learner の「自分の目標ツリー / 次に何をやるか」表示 |
| C. 内部のみ (service_role のみ / UI 非公開) | `proposed_actions`, `schedule_slots`, `agent_runs`, `evaluation_runs` | worker / cron の中間ステート。learner UI には加工後に出す |
| D. 中間ビュー越しに limited 公開 | (A/C の集計を view / RPC 越しに) | owner summary、learner 向け「直近提案サマリ」 |

#### 分類 A: owner 限定

public-facing な RLS / DB 側 owner 判定は `auth.jwt()->'app_metadata'->>'role' = 'owner'` のみに限定する。`user_metadata` は `auth.updateUser` で本人更新できるため、RLS claim source に使うと privilege escalation になる。application layer の `isOwnerUser()` は防御線として `app_metadata` / `user_metadata` の両方を見てもよいが、DB 側の権限制御は admin 管理の `app_metadata` だけを信頼する。`auth.jwt()->>'email'` 依拠は env 依存 (`ADMIN_EMAILS`) になり DB 側に baseline が作れないので避ける。owner は read + UPDATE (decision だけ) 許可、INSERT は service_role のみ維持。

#### 分類 B: learner 自身

`goals.user_id` があるので `user_id = auth.uid()` を基軸に、`goal_nodes` / `goal_contexts` / `goal_node_lesson_matches` は goal_id 経由の join で判定 (`EXISTS (SELECT 1 FROM decision_ledger.goals g WHERE g.id = <table>.goal_id AND g.user_id = auth.uid())`)。`goal_node_lesson_matches` は `goal_node_id` から `goal_nodes.goal_id` への間接 join。write は service_role のみ維持し、learner には read-only。

#### 分類 C: 内部のみ

service_role policy だけ維持し、anon/authenticated 向け policy を追加しない。UI から見たい場合は必ず view / RPC 経由 (分類 D) で整形して出す。こうしないと `agent_runs.error_message` / `evaluation_runs.details` 等に内部情報が露出する。

#### 分類 D: view / RPC

- owner inbox は `decision_ledger.v_owner_pending_lesson_proposals` の view として approval_gates + lesson_dev_proposals を join 済みで出す。`security_invoker = on` にして呼び出し元の RLS を引き継ぎ、owner policy で filter。Next.js 側の `loadApprovalInboxItems()` の N+1 が消える副産物あり。
- learner 向け「アクティブな目標と現在推奨されている lesson」は `public.v_learner_active_goal_nodes` RPC (`security_definer`) で goal_nodes + goal_node_lesson_matches + lessons を join。service_role 相当の権限で join しつつ、WHERE で `user_id = auth.uid()` を強制する (SECURITY DEFINER の定石)。RPC にする理由は、shape 変更を lesson.slug/title 解決など跨 schema join に耐えさせるため。
- 直接テーブル公開は goals / goal_nodes のみ許容 (shape が安定し、read-only)。他は view/RPC 越しに限定する。

### 2.2 view / RPC の使い分け

| ケース | 選択 | 理由 |
|---|---|---|
| owner inbox (pending gate + proposal 詳細) | view (`security_invoker`) | 読み出し shape が安定、owner policy を view の underlying table の RLS に委譲できる |
| learner active goal dashboard | RPC (`security_definer`) | 複数 schema / 集計を混ぜる、`auth.uid()` による強制 filter が必要 |
| proposed_actions を learner に見せる | 将来必要になった時だけ RPC | 内部表現が荒く、UI 出しには整形が必須 |

### 2.3 現行 service-role 経路との両立

- 既存 `service_role_all` policy は **削除せず残す**。worker / cron / API route handler は引き続き service-role で bypass する前提。
- 追加 policy は `authenticated` ロール向けに `FOR SELECT` 中心。`FOR UPDATE` を付けるのは approval_gates (owner の decide) と lesson_dev_proposals (owner_approval / owner_reviewed_* のみ) に限定し、`WITH CHECK` で更新可能カラムを絞る方法は policy だけでは難しいので、**UPDATE は RPC (`decide_lesson_proposal(gate_id, decision, reason)`) 経由にするのが安全**。
- GRANT: 分類 A/B のテーブル / view / RPC について `GRANT USAGE ON SCHEMA decision_ledger TO authenticated;` と必要な `GRANT SELECT` を追加。`public` schema の RPC は実行権限のみ `GRANT EXECUTE`。

## 3. policy 草案 SQL (適用しない)

```sql
-- === 分類 A: owner 限定 read ============================================

-- approval_gates
CREATE POLICY owner_select_approval_gates
  ON decision_ledger.approval_gates
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

-- lesson_dev_proposals
CREATE POLICY owner_select_lesson_dev_proposals
  ON decision_ledger.lesson_dev_proposals
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

-- lesson_gaps (owner triage UI)
CREATE POLICY owner_select_lesson_gaps
  ON decision_ledger.lesson_gaps
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

-- === 分類 B: learner 自身の goal 配下 ===================================

CREATE POLICY learner_select_own_goals
  ON decision_ledger.goals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY learner_select_own_goal_nodes
  ON decision_ledger.goal_nodes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM decision_ledger.goals g
       WHERE g.id = goal_nodes.goal_id AND g.user_id = auth.uid()
    )
  );

CREATE POLICY learner_select_own_goal_contexts
  ON decision_ledger.goal_contexts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM decision_ledger.goals g
       WHERE g.id = goal_contexts.goal_id AND g.user_id = auth.uid()
    )
  );

CREATE POLICY learner_select_own_goal_node_lesson_matches
  ON decision_ledger.goal_node_lesson_matches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM decision_ledger.goal_nodes n
        JOIN decision_ledger.goals g ON g.id = n.goal_id
       WHERE n.id = goal_node_lesson_matches.goal_node_id
         AND g.user_id = auth.uid()
    )
  );

-- === 分類 C: 内部のみ → policy 追加しない (service_role のみ維持) =======
-- proposed_actions / schedule_slots / agent_runs / evaluation_runs

-- === GRANT ==============================================================
GRANT USAGE ON SCHEMA decision_ledger TO authenticated;
GRANT SELECT ON decision_ledger.goals,
                decision_ledger.goal_nodes,
                decision_ledger.goal_contexts,
                decision_ledger.goal_node_lesson_matches,
                decision_ledger.approval_gates,
                decision_ledger.lesson_dev_proposals,
                decision_ledger.lesson_gaps
           TO authenticated;
```

注意: `EXISTS` による join policy はパフォーマンス的に goal_id / goal_node_id に index が必要。既存 migration に `idx_goal_nodes_goal` / `idx_goal_contexts_goal` / `idx_goal_node_lesson_matches_goal_node` があるので許容範囲。`goals(user_id, status)` も既存。

## 4. view / RPC 草案 (適用しない)

```sql
-- owner inbox view: approval_gate + lesson_dev_proposal を join 済みで返す
CREATE OR REPLACE VIEW decision_ledger.v_owner_pending_lesson_proposals
WITH (security_invoker = on) AS
SELECT
  g.id              AS gate_id,
  g.requested_at,
  g.status          AS gate_status,
  g.metadata        AS gate_metadata,
  p.id              AS proposal_id,
  p.capability_slug,
  p.outcome_slug,
  p.priority,
  p.weakest_axis,
  p.rationale,
  p.candidate_lesson_slug,
  p.gap_ids,
  p.status          AS proposal_status,
  p.owner_approval
FROM decision_ledger.approval_gates g
LEFT JOIN decision_ledger.lesson_dev_proposals p
       ON p.id::text = g.metadata ->> 'lesson_dev_proposal_id'
WHERE g.gate_type = 'lesson_proposal'
  AND g.status    = 'pending';

GRANT SELECT ON decision_ledger.v_owner_pending_lesson_proposals TO authenticated;
-- RLS は underlying table に委譲 (security_invoker = on)。

-- owner decide RPC: approval_gate.status と lesson_dev_proposals.owner_approval を
-- atomic に更新する。policy での UPDATE 許可より安全。
CREATE OR REPLACE FUNCTION decision_ledger.decide_lesson_proposal(
  p_gate_id uuid,
  p_decision text,       -- 'approved' | 'rejected'
  p_reason   text DEFAULT NULL
) RETURNS decision_ledger.approval_gates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = decision_ledger, public
AS $$
DECLARE
  v_user_role text;
  v_gate      decision_ledger.approval_gates;
  v_proposal_id uuid;
BEGIN
  v_user_role := auth.jwt() -> 'app_metadata' ->> 'role';
  IF v_user_role <> 'owner' THEN
    RAISE EXCEPTION 'forbidden: owner role required';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'invalid decision: %', p_decision;
  END IF;

  UPDATE decision_ledger.approval_gates
     SET status     = p_decision,
         decided_by = auth.jwt() ->> 'email',
         decided_at = now(),
         reason     = p_reason
   WHERE id = p_gate_id AND gate_type = 'lesson_proposal'
  RETURNING * INTO v_gate;

  v_proposal_id := (v_gate.metadata ->> 'lesson_dev_proposal_id')::uuid;
  IF v_proposal_id IS NOT NULL THEN
    UPDATE decision_ledger.lesson_dev_proposals
       SET owner_approval     = p_decision,
           owner_reviewed_by  = auth.jwt() ->> 'email',
           owner_reviewed_at  = now(),
           owner_review_reason = p_reason,
           status             = p_decision,
           updated_at         = now()
     WHERE id = v_proposal_id;
  END IF;

  RETURN v_gate;
END;
$$;

REVOKE ALL ON FUNCTION decision_ledger.decide_lesson_proposal(uuid,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION decision_ledger.decide_lesson_proposal(uuid,text,text) TO authenticated;
```

learner 向け view は node 状態 + top lesson match を出す shape を想定 (本スパイクでは詳細省略、TQ-156 で確定)。

## 5. API route の読み書き経路変更候補

現在:
- `listPendingApprovalGates` / `getLessonDevProposalById`: service-role, Next.js server component (`page.tsx`) から呼ばれる。
- `updateApprovalGateDecision` / `updateLessonDevProposalOwnerReview`: service-role, server action から呼ばれる。

RLS 整備後の候補:
1. SSR のまま、内部で anon+session cookie クライアント (`createClient()` from `server.ts`) に差し替え、view `v_owner_pending_lesson_proposals` を select。policy により owner だけが見える。service-role 依存を外せる。
2. 承認 action は RPC `decision_ledger.decide_lesson_proposal` に差し替え、サーバ側 `isOwnerUser` チェックは保険として残す (二重ガード)。
3. learner dashboard の API route (`/api/goals/me` 等、未実装) は anon+session で `goals` を直接 select し、`goal_nodes` / `goal_node_lesson_matches` は `EXISTS` join policy 経由で取得。
4. 既存の worker / cron 経路 (`bridge-runner`, `gap-loop`, `goal-tree-shadow`, `scheduler/admin`, `judge-runner`) は **変更しない**。service-role を引き続き使う。

## 6. 後続 TQ 分割案

優先度順、各 TQ は独立 migration + コード差分で出す想定。

- **TQ-155: owner inbox RLS (高 / 先行)**
  - approval_gates / lesson_dev_proposals / lesson_gaps に owner SELECT policy を追加。
  - `v_owner_pending_lesson_proposals` view を追加。
  - 依存: なし。
  - リスク: owner claim が JWT に乗っているか要検証 (Supabase 側で `app_metadata.role` を設定する仕組みが確立しているか)。オープン課題 (7) で扱う。

- **TQ-156: learner read policies (中)**
  - goals / goal_nodes / goal_contexts / goal_node_lesson_matches に learner SELECT policy を追加。
  - 必要なら `public.v_learner_active_goal_nodes` RPC。
  - 依存: TQ-155 と独立だが、先に owner 側で policy シグネチャを固めた後に追従すると整合しやすい。

- **TQ-157: owner UPDATE を RPC 化 (中)**
  - `decide_lesson_proposal` RPC 追加、`security_definer` で設定。
  - `updateApprovalGateDecision` + `updateLessonDevProposalOwnerReview` の二段更新を RPC 1 本に寄せる。
  - 依存: TQ-155。

- **TQ-158: web route の anon 経路差し替え (低 / 最後)**
  - `approval-inbox/page.tsx` / `actions.ts` を `createClient()` + RPC 経由に置き換え、service-role 依存を解除。
  - `decision-ledger.ts` の関数群に「anon 用 read variant」を追加するか、呼び出し元だけを直接 `createClient()` に移すかを決定。
  - 依存: TQ-155, TQ-157。

## 7. オープン課題

- **owner claim のソース**: 現行コードは `app_metadata.role === 'owner'` を見るが、Supabase 上で実際にこの claim を誰がどう設定しているかが未確認。もし未設定なら RLS より先に owner user に対して `app_metadata` を付与する運用を TQ-155 の前提にする必要がある。`ADMIN_EMAILS` env と同様の allowlist policy を DB 側に持つか (`decision_ledger.owner_emails(email text PK)`) は owner の判断が必要。
- **lesson_gaps を learner に出すか**: 仕様上 learner の weakest_axis を本人に見せる UX があり得る。現状は owner-only としたが、`goal_id = any goal owned by auth.uid()` での learner 開示 policy を追加するかは未決定。
- **goal_contexts の source_uri / content の漏洩範囲**: `content` に内部メモや eval_result の生出力が入る可能性があり、learner 本人でも見せて良いかは検討必要。source_type = 'eval_result' だけ除外する policy (`WHERE source_type <> 'eval_result'`) を重ねるかは owner 判断。
- **proposed_actions を UI から見せるか**: 現在 C 分類にしたが、learner dashboard に「AI が今提案している次の一手」を出したいなら view 越しに expose する要求が出る。TQ-156 のスコープに入れるかは open。
- **realtime (Supabase Realtime) の扱い**: browser から `approval_gates` の realtime subscribe を owner UI で使いたくなったら policy だけでなく `supabase_realtime` publication の付与も必要。TQ-155 でやるか分離するかは未決定。
- **service-role rollback**: policy 追加 migration に問題が出た場合、`DROP POLICY` だけで戻せる作りを維持 (既存 service_role policy を触らない)。view/RPC 追加も independent に revert 可能。
