# Production Rollback Runbook (TQ-262)

> Owner-only operation. 本書は production default ON で出している機能を
> 「Vercel env を変更 → redeploy」だけで OFF に戻すための owner runbook。
> code revert より先に env を倒すこと。

`DEPLOY_VERIFICATION.md` §4 と同じ手順を独立 runbook 化したもの。
緊急時は本書だけ読めば対処できる構造にしてある。

---

## 0. 共通手順（どの rollback でも同じ）

1. Vercel Dashboard → Project (school) → Settings → Environment Variables
2. 該当 env を変更（追加 / 値を 0 に / 削除）。**production scope** を選ぶ。
   preview / development は触らないでよい。
3. Deployments タブ → 直近 production deploy → 右上 `Redeploy` → `Use existing Build Cache` で実行
4. Sentry / PostHog / `/api/health` で 5min 内に正常化を確認
5. Discord などで owner / oncall に状況共有

> 例外：BYOK の暗号化キー (`BYOK_ENCRYPTION_KEY_PRIMARY` / 旧
> `BYOK_ENCRYPTION_KEY`) を **unset したり、安全手順を無視して入れ替えたり
> しない**。過去 row が decrypt 不能になる。W14 以降は dual-key envelope
> (`docs/byok-key-rotation.md`) で無停止 rotation が可能なので、key を
> 触る必要が出たら必ずそちらの runbook に従うこと。詳細は §5 参照。

---

## 1. Conductor を OFF に倒す

**症状例**: hearing → goal_nodes → compiled_plans 経路が連続失敗、
SubAgentProgressPanel が永遠に走り続ける、Sentry に `conductor.*` エラー多発。

1. Vercel env で `MENTOR_CONDUCTOR_ENABLED=0` に変更
2. Redeploy
3. /plan/onboarding で hearing が旧 path（2026-04 以前）で動くことを確認
4. Sentry の `conductor.*` 系エラー rate が落ちることを確認

復帰: `MENTOR_CONDUCTOR_ENABLED=1` に戻して redeploy。

---

## 2. 全 model を GLM に倒す（kill-switch）

**症状例**: Anthropic / OpenAI / Gemini が同時障害（または rate limit 同時超過）、
mentor router 経由のすべての sub-agent が失敗。

1. Vercel env に `MENTOR_MODEL_FALLBACK_ALL_GLM=1` を追加
2. Redeploy
3. `pickModelFor` の全 role が GLM-5.1 (ZAI) に倒れる (TQ-227)
4. `ZAI_PLANNER_API_KEY` が live で、quota 余裕があることを別途確認

復帰: env を unset または `0` にして redeploy。

---

## 3. Phase 3 を打ち切って Phase 1 に戻す

**症状例**: Phase 3 opt-in 後に BYOK / per-user budget が破綻、
provider 別コストが想定外に高騰。

1. Vercel env で `MENTOR_PROVIDER_PHASE3=0`（または delete）
2. Redeploy
3. 全リクエストが ZAI 単一に戻ることを Sentry / PostHog で確認
4. budget cap 関連の追加修正は別 PR

---

## 4. hearing 緊急退避（fast intake fallback）

**症状例**: Live AI hearing が連続 5xx / レート超過、ZAI 障害で `/api/planner/hearing` が応答しない。

1. Vercel env に `MENTOR_FAST_INTAKE_FALLBACK=1` を追加
2. Redeploy
3. caller が `preferFastIntake: true` を投げた時に legacy regex path に
   short-circuit される。固定 7 問運用で凌ぐ (TQ-210)。
4. 復帰: env を unset にして redeploy（再び Live AI canonical）。

---

## 5. BYOK 緊急止血

**原則**: BYOK の暗号化キーを **無計画に unset / rotate しない**。
過去の暗号化 row が decrypt 不能になる。

- TQ-247 で UI 文言を「Phase 1 では key を保存するが利用しない」に修正済。
- 機能 surface を一時的に隠したいだけなら feature flag を別途追加し、key の
  保管自体は継続する（rotation は不要）。
- key rotate が必要な場合は **`docs/byok-key-rotation.md` に従って dual-key
  envelope** で実施する。W14 で `BYOK_ENCRYPTION_KEY_PRIMARY` /
  `BYOK_ENCRYPTION_KEY_PREVIOUS` の二段構成に切り替え済みなので、PREVIOUS
  に旧 key を退避してから PRIMARY を入れ替えれば在庫 row も decrypt 可能。
- key 漏洩のように **即時 rotation が必要** な incident では `_PREVIOUS` を
  経由させずに新 key を `_PRIMARY` に投入し、復旧確認後に再暗号化バッチを
  走らせる (詳細は同 runbook の Phase 1〜3)。

---

## 6. Live AI 全体停止

**症状例**: ZAI も Anthropic も OpenAI も Gemini もダウン。

1. `MENTOR_MODEL_FALLBACK_ALL_GLM=1` （§2）
2. それでも駄目なら `MENTOR_FAST_INTAKE_FALLBACK=1`（§4）
3. それでも駄目なら maintenance page を表示する代替策を owner 判断で実施
   （現状 maintenance page は未実装。必要なら別 TQ で）

---

## 7. code rollback（最終手段）

env では戻せない、または code regression が原因と確定した場合のみ。

1. `git revert <commit-sha>` を main で commit、PR 作成、merge
2. Vercel に push、production deploy を owner が手動承認
3. 直近 commit に migration が含まれる場合は **DB migration を先に rollback**
   できるか確認（drop column / table の有無）。**できない場合は revert を保留**
   して、env-level workaround を優先。

---

## 8. 確認 checklist（rollback 後）

- [ ] `/api/health` が 200
- [ ] Sentry の error rate が pre-incident に戻った
- [ ] PostHog の core funnel (`goal_input` → `hearing_complete` → `plan_generated`) が回復
- [ ] /plan/onboarding を踏んで hearing が応答する
- [ ] owner / oncall に「収束した env / 残課題」を共有
- [ ] Plane に incident note と post-mortem TQ を起票

---

## 9. 履歴

| Date | TQ | 概要 |
|------|----|------|
| 2026-05-09 | TQ-262 | 初版。`DEPLOY_VERIFICATION.md` §4 と一致した owner-only runbook を独立化。 |
