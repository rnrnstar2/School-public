type LessonBlueprint = {
  slug: string
  title: string
  moduleId: string
  milestoneId: string
  minutes: number
  summary: string
  whyThisMatters?: string
  howToDo?: string
  commonBlockers?: string
  confirmationMethod?: string
  prerequisites: string[]
  goalTags: string[]
  capabilityTags: string[]
  blockerTags: string[]
  personaTags?: string[]
}

const lessonBlueprints: LessonBlueprint[] = [
  {
    slug: 'choose-project-goal',
    title: 'Choose the project goal',
    moduleId: 'scope-the-build',
    milestoneId: 'milestone-project-brief',
    minutes: 25,
    summary: 'Pick one realistic goal for the first shipped site.',
    whyThisMatters: '目的が曖昧だと必要なページが決まりません。',
    howToDo: '対象ユーザーと最初の完成条件を一文ずつ書きます。',
    commonBlockers: 'アイデアが大きすぎる。',
    confirmationMethod: '目的と対象ユーザーを説明できること。',
    prerequisites: [],
    goalTags: ['start-project'],
    capabilityTags: ['scope-definition'],
    blockerTags: ['idea-too-big'],
  },
  {
    slug: 'define-mvp-pages',
    title: 'Define MVP pages',
    moduleId: 'scope-the-build',
    milestoneId: 'milestone-project-brief',
    minutes: 30,
    summary: 'Turn the idea into pages and one user flow.',
    whyThisMatters: 'ページ数を決めないと作業が発散します。',
    howToDo: '必要なページと主要導線を 1 本に絞ります。',
    commonBlockers: 'ページ数を増やしすぎる。',
    confirmationMethod: 'MVP ページ一覧を説明できること。',
    prerequisites: ['lesson_web_builder_010_choose_project_goal'],
    goalTags: ['mvp-planning'],
    capabilityTags: ['workflow-planning'],
    blockerTags: ['too-many-pages'],
  },
  {
    slug: 'implementation-checklist',
    title: 'Create the implementation checklist',
    moduleId: 'scope-the-build',
    milestoneId: 'milestone-project-brief',
    minutes: 20,
    summary: 'Break the project into tasks.',
    whyThisMatters: 'タスクが大きいと AI の出力を確認しにくくなります。',
    howToDo: '30 分前後で終わる粒度のチェックリストへ分解します。',
    commonBlockers: '',
    confirmationMethod: '優先順位付きのチェックリストがあること。',
    prerequisites: ['lesson_web_builder_020_define_mvp_pages'],
    goalTags: ['mvp-planning'],
    capabilityTags: ['task-breakdown'],
    blockerTags: ['scope-drift'],
  },
  {
    slug: 'node-pnpm-setup',
    title: 'Prepare Node.js and pnpm',
    moduleId: 'setup-the-workspace',
    milestoneId: 'setup-workspace',
    minutes: 20,
    summary: 'Install Node.js and pnpm for local work.',
    whyThisMatters: 'Node.js がないと CLI や create-next-app が動きません。',
    howToDo: 'node -v と pnpm -v を確認し、npm run dev 前提を整えます。',
    commonBlockers: 'PATH が通っていない。',
    confirmationMethod: 'node -v と pnpm -v が通ること。',
    prerequisites: ['lesson_web_builder_030_implementation_checklist'],
    goalTags: ['setup-environment'],
    capabilityTags: ['tooling-setup'],
    blockerTags: ['node-not-installed'],
    personaTags: ['browser-first-maker'],
  },
  {
    slug: 'git-github-cli',
    title: 'Use Git and GitHub from the CLI',
    moduleId: 'setup-the-workspace',
    milestoneId: 'setup-workspace',
    minutes: 20,
    summary: 'Verify git config and GitHub auth from the CLI.',
    whyThisMatters: 'Git の正本がないと変更管理が不安定です。',
    howToDo: 'git config と git status、GitHub 認証確認を行います。',
    commonBlockers: '認証状態が曖昧なまま進める。',
    confirmationMethod: 'git status と GitHub 認証状態を確認できること。',
    prerequisites: ['lesson_web_builder_048_node_pnpm_setup'],
    goalTags: ['setup-environment'],
    capabilityTags: ['version-control'],
    blockerTags: ['git-not-configured'],
  },
]

export const webBuilderTrack = {
  id: 'web-builder-ai',
} as const

export { lessonBlueprints }
