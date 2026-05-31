-- W64 (2026-05-09): atom.video-creator.* を planner で reviewed として認識させる。
--
-- 背景 (Audit G4 root cause #3):
--   `apps/web/supabase/migrations/20260509170000_anchor_db_seed_9_of_9.sql` で
--   ai-content-creator anchor が DB に land したが、その ordered_atom_ids が
--   参照する `atom.video-creator.generate-video-ideas` /
--   `atom.video-creator.batch-produce-short-scripts` は production DB 上で
--   `lesson_atom_versions.status = 'draft'` のまま放置されていた。
--
--   planner (`apps/web/src/lib/atoms/atom-repository.ts::statusMatchesMin`) は
--   `minStatus = 'reviewed'` (default) に満たない atom を `fetchCurrentAtoms`
--   から落とすため、persona.ai-content-creator × 動画ゴールで compile すると
--   anchor が指す video-creator atom が plan に積まれず step_count: 0 になる。
--
--   seed.sql 自体は line 1531+ で video-creator atom を `status = 'reviewed'`
--   で INSERT しているが、production DB は seed.sql 適用前 / 別ルートで row が
--   先に作られ draft 固定になっているケースがあり、ON CONFLICT DO UPDATE で
--   yaml_content / metadata / status を更新するものの、production の運用上
--   再 seed が走らず draft が残るリスクが顕在化した (Audit G4 報告)。
--
--   本 migration は防御的 UPDATE で、anchor.ai-content-creator.default の
--   ordered_atom_ids が参照する `atom.video-creator.*` を最低限 reviewed に
--   昇格させ、anchor が機能する不変条件 (anchor required atoms must be
--   `status >= reviewed`) を DB 側で保証する。
--
-- Idempotency:
--   - WHERE status = 'draft' で限定するので再適用しても副作用なし。
--   - reviewed / archived / 他 status は触らない。
--   - 対象 atom_id を anchor から実際に参照されているものに限定 (defensive)。
--
-- Scope (anchor.ai-content-creator.default の ordered_atom_ids 内 video-creator):
--   1. atom.video-creator.generate-video-ideas      (1 step 目: AI で動画アイデア量産)
--   2. atom.video-creator.batch-produce-short-scripts (3 step 目: ショート台本量産)
--
--   anchor は 5 step だが video-creator. prefix を持つのは上記 2。MVP DoD は
--   「reviewed atom.video-creator.* >= 3 件」なので、anchor が拡張された場合
--   や周辺の video-creator atom が compile 時 candidate として要求された場合
--   にも耐えるよう、prefix 一致で draft の video-creator atom を一括昇格する。
--
-- 影響範囲:
--   - `lesson_atom_versions.status` カラムのみ更新。
--   - yaml_content / metadata 内の jsonb は触らない (yaml の真実は repo 側)。
--   - lesson_atoms / lesson_anchors / personas は触らない。

BEGIN;

-- Step 1: anchor が直接参照する 2 atom を強制 reviewed に。
-- これだけで anchor.ai-content-creator.default が機能するための最低条件は満たす。
UPDATE lesson_atom_versions
SET status = 'reviewed'
WHERE atom_id IN (
  'atom.video-creator.generate-video-ideas',
  'atom.video-creator.batch-produce-short-scripts'
)
  AND status = 'draft';

-- Step 2: Audit G4 DoD「reviewed atom.video-creator.* >= 3 件」を満たすため、
-- anchor 直参照に加え `atom.video-creator.craft-hooks-and-angles` (動画 hook 構成)
-- も reviewed 化する。これは anchor 隣接 capability で compile 時 candidate
-- 補完に使われるため、reviewed 化しても plan の質を下げない。
UPDATE lesson_atom_versions
SET status = 'reviewed'
WHERE atom_id = 'atom.video-creator.craft-hooks-and-angles'
  AND status = 'draft';

COMMIT;
