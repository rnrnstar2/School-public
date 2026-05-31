export interface LessonMediaRef {
  type: string
  url: string
  caption?: string
  alt?: string
}

export const lessonMediaRefsByLessonId: Record<string, LessonMediaRef[]> = {
  'lesson_web_builder_041_ai_coding_tool_overview': [
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_041_ai_coding_tool_overview/claude-code-workflow.png',
      caption:
        'Claude Codeの全体像。開発者がターミナルでClaude Codeを使うと、AIの推論、プロジェクトのファイル理解、Git操作支援がどうつながるかを1枚で示します。',
      alt: 'Claude Codeがターミナル、AI推論、プロジェクトファイル、Gitコミットをつなぐワークフロー図',
    },
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_041_ai_coding_tool_overview/claude-code-quickstart.png',
      caption:
        '最初の3ステップ。初回セットアップで必要な流れだけを圧縮したクイックスタート図です。本文を読む前の地図として使えます。',
      alt: 'Claude Codeのインストール、認証、起動の3ステップを示すインフォグラフィック',
    },
  ],

  'lesson_web_builder_042_choose_ai_tool_by_goal_os_cli': [
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_042_choose_ai_tool_by_goal_os_cli/tool-decision-flowchart.png',
      caption:
        'OS・CLI 慣れ・goal の 3 軸で分岐する AI tool 選定フローチャート。自分がどのルートに当てはまるかを確認できます。',
      alt: 'OS、CLI慣れ、goalの3条件でClaude Code / Codex / ChatGPT / GUI assistantに分岐するフローチャート',
    },
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_042_choose_ai_tool_by_goal_os_cli/tool-comparison-table.png',
      caption:
        '4 つの AI tool を「得意な場面」「向かないケース」「導入の手軽さ」で比較した一覧表。選定後の振り返りにも使えます。',
      alt: 'Claude Code、Codex、ChatGPT、GUI assistantの比較表（得意な場面、向かないケース、導入の手軽さ）',
    },
  ],

  'lesson_web_builder_043_why_claude_code_or_codex': [
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_043_why_claude_code_or_codex/claude-code-vs-codex.png',
      caption:
        'Claude Code と Codex の作業スタイル比較。同じ goal を扱うとき、それぞれがどのように進めるかを並べて示します。',
      alt: 'Claude CodeとCodexの作業フロー比較図。Claude Codeは長い文脈保持、Codexはタスク単位の依頼が特徴',
    },
  ],

  'lesson_web_builder_044_install_claude_code_and_verify': [
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_044_install_claude_code_and_verify/install-steps.png',
      caption:
        'Claude Code インストールの 3 ステップ。npm install → claude --version → 認証の流れをスクリーンショットで示します。',
      alt: 'ターミナルでnpm install -g @anthropic-ai/claude-codeを実行し、バージョン確認するスクリーンショット',
    },
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_044_install_claude_code_and_verify/verify-checklist.png',
      caption:
        'インストール後の確認チェックリスト。バージョン表示、PATH 確認、認証状態の 3 点を確認します。',
      alt: 'Claude Codeインストール後の確認チェックリスト（バージョン、PATH、認証）',
    },
  ],

  'lesson_web_builder_045_install_codex_cli_and_verify': [
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_045_install_codex_cli_and_verify/install-steps.png',
      caption:
        'Codex CLI インストールの 3 ステップ。npm install → codex --version → 認証の流れをスクリーンショットで示します。',
      alt: 'ターミナルでCodex CLIをインストールし、バージョン確認するスクリーンショット',
    },
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_045_install_codex_cli_and_verify/verify-checklist.png',
      caption:
        'インストール後の確認チェックリスト。バージョン表示、PATH 確認、認証状態の 3 点を確認します。',
      alt: 'Codex CLIインストール後の確認チェックリスト（バージョン、PATH、認証）',
    },
  ],

  'lesson_web_builder_046_first_project_and_basic_ai_requests': [
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_046_first_project_and_basic_ai_requests/first-prompt-example.png',
      caption:
        '最初の AI 依頼文の書き方。goal、現在の状態、やりたいことの 3 要素を含むプロンプト例です。',
      alt: 'AI coding toolへの最初の依頼文テンプレート（goal・現在の状態・やりたいことの3要素）',
    },
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_046_first_project_and_basic_ai_requests/project-creation-flow.png',
      caption:
        'プロジェクト作成から最初の依頼までのフロー図。ディレクトリ作成 → AI 起動 → 依頼 → 確認の一連を示します。',
      alt: 'プロジェクト作成から最初のAI依頼までの4ステップフロー図',
    },
  ],

  'lesson_web_builder_047_common_install_failures_and_fixes': [
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_047_common_install_failures_and_fixes/troubleshoot-flowchart.png',
      caption:
        'インストール失敗時の切り分けフローチャート。権限エラー → PATH 問題 → Node.js バージョン → 認証失敗の順に確認します。',
      alt: 'CLIインストール失敗時のトラブルシュートフローチャート（権限、PATH、Node.js、認証の順）',
    },
  ],

  'lesson_web_builder_048_node_pnpm_setup': [
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_048_node_pnpm_setup/node-pnpm-verify.png',
      caption:
        'Node.js と pnpm のバージョン確認スクリーンショット。`node -v` と `pnpm -v` の期待される出力を示します。',
      alt: 'ターミナルでnode -vとpnpm -vを実行した結果のスクリーンショット',
    },
  ],

  'lesson_web_builder_049_git_github_cli': [
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_049_git_github_cli/git-setup-checklist.png',
      caption:
        'Git / GitHub 設定の確認チェックリスト。`git config`、SSH or HTTPS 認証、`gh auth status` を確認します。',
      alt: 'Git初期設定とGitHub認証の確認チェックリスト',
    },
  ],

  'lesson_web_builder_050_create_next_app': [
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_050_create_next_app/create-next-app-terminal.png',
      caption:
        '`pnpm create next-app` の実行結果。プロジェクト名、TypeScript、App Router などの選択肢が表示されます。',
      alt: 'ターミナルでpnpm create next-appを実行し、設定項目を選択する画面のスクリーンショット',
    },
    {
      type: 'image',
      url: '/lesson-assets/lesson_web_builder_050_create_next_app/dev-server-running.png',
      caption:
        '`pnpm dev` でローカルサーバーが起動した状態。ブラウザで localhost:3000 を開いた初期画面です。',
      alt: 'Next.jsの初期画面がlocalhost:3000で表示されているブラウザのスクリーンショット',
    },
  ],
}
