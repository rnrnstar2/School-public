const lessonCopyById: Record<
  string,
  { title: string; summary: string; moduleTitle: string }
> = {
  lesson_web_builder_010_choose_project_goal: {
    title: '作りたいサイトの目的を決める',
    summary: '誰に向けたサイトか、最初に何を出すかを決めます。',
    moduleTitle: '企画整理',
  },
  lesson_web_builder_020_define_mvp_pages: {
    title: '最初に必要なページを決める',
    summary: 'MVP に必要なページと主導線を整理します。',
    moduleTitle: '企画整理',
  },
  lesson_web_builder_030_implementation_checklist: {
    title: '実装チェックリストへ分解する',
    summary: 'AI に頼みやすい粒度へ分解して順番を決めます。',
    moduleTitle: '企画整理',
  },
  lesson_web_builder_048_node_pnpm_setup: {
    title: 'Node.js と pnpm を CLI でセットアップする',
    summary: 'Node.js と pnpm を導入して実行確認まで終えます。',
    moduleTitle: 'AI導入',
  },
  lesson_web_builder_049_git_github_cli: {
    title: 'Git / GitHub を CLI で使える状態にする',
    summary: 'Git 設定と GitHub 連携を CLI で確認します。',
    moduleTitle: 'AI導入',
  },
}

const milestoneCopyById: Record<
  string,
  { title: string; description: string; evidence: string[]; artifactGoal: string }
> = {
  'milestone-project-brief': {
    title: '公開する内容が決まった',
    description: '最初に作る内容の範囲と優先順位が整理された状態です。',
    evidence: ['サイトの一言説明', 'MVP ページ一覧', '実装チェックリスト'],
    artifactGoal: '最初に公開する内容を言語化する',
  },
  'setup-workspace': {
    title: 'AI coding workspace ready',
    description: '必要な CLI と作業前提がそろった状態です。',
    evidence: ['Node.js 確認', 'pnpm 確認', 'GitHub 連携'],
    artifactGoal: 'ローカルの前提を整える',
  },
}

export { lessonCopyById, milestoneCopyById }
