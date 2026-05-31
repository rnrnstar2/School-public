export const BRAND_NAME = 'School'
export const BRAND_TAGLINE = 'AI で実現したい人が、迷わず前進する mentor workspace'
export const BRAND_BADGE = 'Goal-first mentor workspace'
export const BRAND_DESCRIPTION =
  'School は Goal を共有すると、chat で前提を整え、plan と次の action まで mentor workspace にまとめる goal-first workspace です。'

export const HOMEPAGE_FLOW_STEPS = ['Goal', 'Chat', 'Plan', 'Action'] as const

export const HOMEPAGE_PRIMARY_CTA = {
  label: 'Goal を共有する',
  href: '/plan/onboarding',
  eyebrow: 'Onboarding intake',
  title: '最初の Goal を mentor workspace に入れる',
  description:
    'やりたいことを一言で共有すると、AI が chat で前提を整え、次の plan と action まで onboarding でつなぎます。',
} as const

export const HOMEPAGE_SECONDARY_CTA = {
  label: '補助レッスンを見る',
  href: '/lessons',
  eyebrow: 'Lesson system',
  title: '必要なレッスンだけ後から開く',
  description:
    'Goal-first の進行に必要な教材を、lesson system から補助的に参照できます。',
} as const

export const HOMEPAGE_FEATURES = [
  {
    name: 'Goal Tree',
    title: '大きな目標を、迷わない単位まで分解する',
    description:
      'やりたいことを goal tree に落とし込み、今どの枝を進めるべきかを mentor workspace で見失いません。',
  },
  {
    name: 'Ask2Action',
    title: '次に聞くべきことを AI が先回りする',
    description:
      '空のフォームに悩まず、必要な質問から会話を始めて次の action まで一気通貫でつなぎます。',
  },
  {
    name: 'Speak2Action',
    title: '会話の内容を plan と action に変換する',
    description:
      '相談やヒアリングで出た意図を、その場で plan と next action に変えて前進コストを下げます。',
  },
  {
    name: 'Agent2Action',
    title: '人が抱える前に、AI に渡せる仕事へ整える',
    description:
      '実装や調査に向いた作業は agent brief にまとめ、やるべきことをそのまま委譲可能な粒度にします。',
  },
  {
    name: 'Context Panel',
    title: '散らばった前提を、goal 単位で束ねる',
    description:
      'goal tree、メモ、artifact、判断履歴を context panel に集約し、途中参加でも同じ文脈から再開できます。',
  },
] as const
