# メタメンター戦略（2026-05-08 owner 確定）

## 一行サマリー

School は **vibe coding ツール（v0 / Bolt / Lovable / Cursor / Claude Code / Codex CLI 等）を束ねる、日本語ファーストのメタメンター（Goal OS）**である。生成エンジンは内製せず、**外部から呼び出す側**に立つことで、Goal の継続性 / 伴走品質 / 学習者理解の積み上げに集中する。

## なぜこの戦略か

owner が 2026-05-08 に確定:

> 「組み合わせるのではなく、メンターが最高の Goal までのプランを作成するのがメイン」  
> 「vibe coding は内製しない。School は生成エンジンを束ねる側に回る」

competitor landscape（`investigator-10.md` 参照）: Lovable / Bolt.new / v0.dev / Replit Agent v3 が「自然言語 → 動くアプリ + ワンクリック deploy」を 10〜15 分で提供している。School が "自分でコードを書く / lesson を読む / CLI を立ち上げる" という前提のままでは確実に負ける。

しかし vibe coding 系の共通弱点は明確:

1. **Goal Tree / 進捗 / 卒業判断が無く 1 セッション使い捨て**
2. **学習者の理解が積み上がらない（次回ゼロから説明）**
3. **日本語ファースト + メンター伴走の温度感が薄い**
4. **「なぜそれを作るのか / 使うのか」を問い直す対話が無い**

School が刺すべきはここ。

## ポジションの 4 本柱

### 1. Goal Tree first（永続化されたゴール構造）

ChatGPT / Lovable / v0 のいずれも 1 セッション使い捨て。School は `goal → plan → milestone → task` を永続化し、再訪時に「今どこにいるか」を提示できる**唯一のレイヤー**。要件定義書 §2.2「ユーザーは常に `今の目標` `今の現在地` `次にやること` を把握できる」と一致しており、競合がここを取りに来ていない。

### 2. メンター伴走（mentor_memory + 日本語温度）

Khanmigo の "make you feel dumb にしない" / Brilliant の "hint をすぐ出さない" 哲学を**日本語の口調で**実装する。Lovable / v0 は機械的、ChatGPT Projects は記憶が薄い。

mentor_memory は長文ログではなく、次回の支援品質を上げるための要点メモとして保持（要件定義書 §6.9）。

### 3. AI ツールメタ層

School 自身が webアプリを生成する必要はない。むしろ「**Cursor / Claude Code / Codex CLI / v0 / Bolt のどれをいつ使うか**」を判断するメタ知識がコア。

これは Owner Directive #11（「特定 2 製品の違い説明ではなく比較 lesson」）の延長線で、競合の盲点。

### 4. 動的卒業ゲート（ペルソナ × goal で決定）

固定の Vercel URL ではなく、ペルソナ × goal で卒業条件を決める（Owner 2026-05-08 確定）。

- web → Vercel URL 公開 / GitHub repo / Lovable URL
- マーケ → キャンペーン LP 公開
- デザイン → Figma 公開
- AI 業務自動化 → ワークフロー実行録画

Conductor の COMMIT phase で「あなたの卒業ゲートはどれにしますか?」と提示。学習者選択可能、合理的なら AI が他の証跡も認める。

## やらないこと

### vibe coding（webアプリ自体を School 内で生成すること）

理由: v0 / Bolt / Lovable / Replit は専業で資本を投じている。後追いで生成エンジンを持つと、品質も速度も摩擦も全部負ける。School の優位は「**生成エンジンを束ねる**」側に立つこと。

実装ガード:
- ZAI / GLM-5 で React コンポーネント生成を MVP に組み込まない
- 代わりに「v0 / Bolt / Lovable をどう呼び出すか」を lesson / plan step として設計する

### 機能羅列で情報過多にすること

Lovable が「非技術者向け UI 最強」と評価されているのは**画面が極端にシンプル**だから。School 要件 §24「プランページ簡素化」「現在のタスクと次の一手だけ」と一致しているが、過去 TQ で機能を増やすたびに**隠す側の意思決定**を続ける必要がある。

### 英語前提 / エンジニア前提 onboarding

日本語ファーストは School の本質的な差別化軸。

## プラン品質の評価軸 3 本柱

プラン提案を採点する時はこの 3 軸を必ず通す。1 つでも弱ければ「最高のプラン」ではない。

1. **AI フル活用度**: プラン中に Claude Code / Codex / Cursor / GLM-5 / Gemini / v0 / Bolt 等の AI 武器が最大限組み込まれているか
2. **非エンジニア対応度**: 技術前提を最小化し、AI に委譲できる工程を全部委譲しているか
3. **最短到達度**: P-ENG-PROTOTYPE KPI（max_steps_to_first_lesson=6 / max_ai_friction_events=1 / max_duration_ms=45000）達成

owner 主訴（2026-05-08）「出てきたプランが全然 AI をフル活用して非エンジニアが最短でゴールを達成するものではなかった」への直接回答。

## 実装方針への影響

### plan compiler

- step → tool 割当フィールドを持つ（TQ-A6）。step ごとに「Cursor で骨を作る」「v0 で UI だけ作り直す」などの AI 武器を明記
- ZAI / GLM-5 でコンポーネント生成しない。v0 / Bolt / Lovable への外部リンクとして plan に組み込む

### lesson 設計

- 「v0 vs Bolt」「Cursor vs Codex CLI」「Cursor vs Lovable」のような比較 lesson を主軸とする
- 「今日は Lovable で 10 分プロト → 明日 Cursor で本実装」のような 2 段構え lesson を持つ

### Conductor / sub-agent

- Main Mentor が複数の sub-agent を起動して調査・分析させながらプランを作る（hub-and-spoke）
- 4 provider 体制（Anthropic / OpenAI / Gemini / ZAI）で sub-agent を得意分野で振り分け
- BYOK（Bring Your Own Key）で学習者本人の API key を使う

## 参照

- `要件定義書.md` §0.1（ビジョン更新 2026-05-08）
- `CURRENT_MISSION.md` Owner Directive #32 / #33 / #34
- `.agent-work/2026-05-08_mentor-quality/AGGREGATE.md` §4.5（owner 確定事項）
- `.agent-work/2026-05-08_mentor-quality/investigator-10.md`（競合ベンチマーク + ポジショニング提言）
- `~/.claude/projects/-Users-rnrnstar-github-School/memory/project_mentor_quality_vision.md`
