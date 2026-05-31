/**
 * Non-engineer friendly explanations for technical terms that surface
 * on lesson detail / atom views.
 *
 * Two layers:
 *  1. Fixed labels (deliverable / evidence / media)
 *  2. capability_outputs strings (kebab-case identifiers like
 *     `auth-email-password`, `crud-operations`). Because there are dozens of
 *     them, we use a small lookup with prefix-based fallbacks so unknown
 *     capabilities still receive a sensible plain-Japanese description.
 */

export interface GlossaryEntry {
  /** Short, plain-Japanese term shown to learners */
  term: string
  /** One-sentence explanation aimed at non-engineers */
  description: string
}

// ── Section / column labels ──

export const DELIVERABLE_GLOSSARY: GlossaryEntry = {
  term: '成果物',
  description:
    'このレッスンが終わったとき、あなたの手元に残る具体的な成果物です(例: 公開済みの Web ページ、動作するフォームなど)。',
}

export const EVIDENCE_GLOSSARY: GlossaryEntry = {
  term: '証跡',
  description:
    '成果物が正しく作れたことを確認するためのチェックリストです(例: ブラウザで動作する、フォーム送信で値が保存される)。',
}

export const MEDIA_GLOSSARY: GlossaryEntry = {
  term: 'メディア',
  description:
    'レッスン内に出てくる図や動画のスロットです。実際の画面やイメージで理解を補助します。',
}

// ── Capability map ──
//
// Keep this list curated rather than exhaustive. Use prefix matching for
// the long tail.

const CAPABILITY_MAP: Record<string, string> = {
  // Setup / environment
  'node-installed': 'Node.js（プログラムを動かす土台）が PC に入っている状態を作れます。',
  'pnpm-installed': 'pnpm（必要な部品をまとめて入れる道具）を使えるようになります。',
  'install-claude-code-and-verify': 'Claude Code を PC にインストールして動作確認できる状態を作れます。',
  'claude-code-configured': 'Claude Code を自分の PC で快適に動かす設定ができます。',
  'choose-ai-tool-by-goal-os-cli': '目標と環境に合った AI ツールを自分で選べるようになります。',
  'understand-env-files': '秘密の鍵などをまとめる「環境変数ファイル」のしくみがわかります。',
  'secure-secret-management': 'API キーなどを安全に管理する基本ルールが身につきます。',

  // Project scaffolding
  'create-next-project': 'Next.js（人気の Web アプリ枠組み）でゼロから新しいプロジェクトを作れます。',
  'run-dev-server': '作りかけの Web ページを自分の PC で確認できる状態にできます。',
  'define-mvp-pages': '最初に必要な最低限のページ構成を決められます。',
  'understand-routing': '「どの URL でどのページを出すか」のしくみがわかります。',
  'create-pages': '新しいページをプロジェクトに追加できるようになります。',
  'shared-layout': '全ページに共通のヘッダー/フッターを作って整理できます。',
  'navigation-menu': 'ページ間を移動できるメニューを作れます。',

  // UI / styling
  'install-shadcn': '見栄えの整った UI 部品セット（shadcn）を使えるようにできます。',
  'add-shadcn-component': 'ボタンやカードなどの既製 UI 部品を画面に追加できます。',
  'image-handling': 'ページに画像を表示する方法がわかります。',
  'icon-usage': 'アイコンを使って画面をわかりやすく装飾できます。',
  'responsive-design': 'スマホでもパソコンでも崩れずに見えるレイアウトが作れます。',
  'loading-ui': '読み込み中の表示を出して、待ち時間でも安心感を与えられます。',
  'error-ui': 'エラーが起きたときに親切なメッセージを出せます。',
  'favicon-set': 'ブラウザのタブに表示される小さなアイコンを設定できます。',
  'branding-configured': 'サービスの色やロゴなどブランドの基本設定を整えられます。',

  // Data / DB
  'crud-operations': 'データを作る・読む・書き換える・消す、という基本操作ができるようになります。',
  'read-data-in-next': 'Next.js から保存されたデータを取り出して画面に表示できます。',
  'table-designed': '保存したい情報の入れ物（テーブル）を設計できます。',
  'rls-policies-set': 'データを「誰が見られて誰が書き換えられるか」のルールを設定できます。',
  'understand-rls': 'データを安全に守るルール（RLS）の考え方がわかります。',
  'write-basic-policy': '基本的なデータ保護ルールを自分で書けるようになります。',
  'file-upload': 'ユーザーが画像やファイルをアップロードできる仕組みを作れます。',
  'storage-bucket': 'アップロードされたファイルの保管場所を用意できます。',

  // Auth
  'auth-email-password': 'メールアドレスとパスワードでログインする仕組みを作れます。',
  'session-management': 'ログイン状態を保ったり、ログアウトしたりできる仕組みを整えられます。',
  'oauth-login': 'Google などの外部アカウントでログインする仕組みを作れます。',

  // Forms
  'form-basics': 'ユーザーの入力を受け取る基本的なフォームを作れます。',
  'handle-user-input': 'フォームに書かれた内容を受け取って処理できます。',
  'contact-form-live': '実際に問い合わせを受け付けるフォームを公開できます。',
  'email-notification': 'フォーム送信などを引き金にメール通知を送れます。',
  'email-sending': 'プログラムからメールを送れる仕組みを作れます。',

  // Deploy / ops
  'initialize-git-repo': '作業履歴を残せる Git リポジトリを用意できます。',
  'connect-github-remote': '自分のコードを GitHub に保管できます。',
  'continuous-deploy-workflow': 'コードを更新したら自動で本番に反映される仕組みを作れます。',
  'preview-deploy-workflow': '公開前にプレビュー URL で確認する仕組みを作れます。',
  'vercel-env-configured': '公開先（Vercel）に必要な設定値を登録できます。',
  'custom-domain-connected': '自分のドメイン名で Web サイトを公開できます。',
  'analytics-configured': 'サイトに来てくれた人の動きを計測できる仕組みを入れられます。',
  'seo-metadata-set': '検索結果に表示される情報を整えられます。',
  'og-image-configured': 'SNS でシェアされたときに表示される画像を設定できます。',
  'legal-pages-created': '利用規約やプライバシーポリシーのページを準備できます。',
  'payment-integration': '決済機能を組み込めます。',

  // AI literacy / debug
  'effective-prompting': 'AI に伝わりやすい指示文（プロンプト）の書き方がわかります。',
  'apply-ai-output': 'AI が出してきた回答を実際の作業に取り入れられます。',
  'create-implementation-checklist': 'やるべきことを順序立てたチェックリストを作れます。',
  'error-reporting-to-ai': 'エラー内容を AI に正しく伝えて助けてもらえます。',
  'debug-build-errors': 'ビルド時のエラーを読み解いて解消できます。',
  'diagnose-install-error': 'インストール時のつまずきを切り分けて原因を特定できます。',
  'apply-common-fix': 'よくある不具合に対する定番の対処法を当てられます。',
  'production-debug-skill': '公開後に発生した問題を冷静に切り分けられるようになります。',
  'ai-code-review-skill': 'AI に書いてもらったコードを自分なりにレビューできます。',
  'start-first-ai-project': 'はじめての AI プロジェクトの一歩を自分で踏み出せます。',
}

// Prefix-based fallbacks for unknown capabilities. Order matters: first
// match wins.
const PREFIX_FALLBACKS: Array<{ prefix: string; description: (rest: string) => string }> = [
  {
    prefix: 'install-',
    description: () => '必要な道具をインストールして使える状態にできます。',
  },
  {
    prefix: 'configure-',
    description: () => 'ツールを自分の環境に合わせて設定できます。',
  },
  {
    prefix: 'understand-',
    description: () => '関連するしくみを言葉で説明できるようになります。',
  },
  {
    prefix: 'debug-',
    description: () => '問題の原因を切り分けて解消できます。',
  },
  {
    prefix: 'auth-',
    description: () => 'ユーザーの認証（ログイン）に関する仕組みを作れます。',
  },
]

function humanizeCapabilityKey(key: string): string {
  // Turn `auth-email-password` into `auth email password` for the fallback
  // template — purely informational.
  return key.replace(/-/g, ' ')
}

/**
 * Returns a non-engineer friendly description for a capability output
 * string. Always returns *something* — never null — so it's safe to use
 * directly inside a tooltip body.
 */
export function describeCapability(capability: string): GlossaryEntry {
  const trimmed = capability.trim()
  if (!trimmed) {
    return {
      term: capability,
      description: 'このレッスンで身につくスキルのタグです。',
    }
  }

  const direct = CAPABILITY_MAP[trimmed]
  if (direct) {
    return { term: trimmed, description: direct }
  }

  for (const { prefix, description } of PREFIX_FALLBACKS) {
    if (trimmed.startsWith(prefix)) {
      return { term: trimmed, description: description(trimmed.slice(prefix.length)) }
    }
  }

  return {
    term: trimmed,
    description: `「${humanizeCapabilityKey(trimmed)}」に関するスキルがこのレッスンで身につきます。`,
  }
}
