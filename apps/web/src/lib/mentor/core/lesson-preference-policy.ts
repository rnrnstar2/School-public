/**
 * MENTOR-006: Lesson Preference Policy
 *
 * コーチングロールの応答で「既存レッスンを優先参照する」ポリシーを
 * プロンプトディレクティブとして生成する。
 *
 * AI が長文の説明を自前で生成する前に、既存レッスンに該当コンテンツが
 * あるかを確認し、ある場合はレッスンへの誘導を行うよう指示する。
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** レッスン候補の最小情報 */
export interface LessonCandidate {
  id: string;
  title: string;
  summary: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ディレクティブに含めるレッスン候補の上限 */
const MAX_LESSON_CANDIDATES = 15;

/** レッスン要約の切り詰め文字数 */
const SUMMARY_TRUNCATE_LENGTH = 120;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * 「既存レッスン優先」ポリシーのプロンプトディレクティブを生成する。
 *
 * 返却される文字列はシステムプロンプトに直接埋め込める形式。
 * レッスン候補が0件の場合は空文字を返す（ポリシー注入不要）。
 *
 * @param availableLessons - 現在利用可能なレッスン一覧
 * @param currentContext - 学習者が今取り組んでいる内容の説明（タスク名やゴール）
 * @returns プロンプトに埋め込むディレクティブ文字列（レッスン0件なら空文字）
 */
export function buildLessonPreferenceDirective(
  availableLessons: LessonCandidate[],
  currentContext: string,
): string {
  if (availableLessons.length === 0) {
    return '';
  }

  const candidates = availableLessons.slice(0, MAX_LESSON_CANDIDATES);

  const lessonList = candidates
    .map((lesson) => {
      const summary = lesson.summary.length > SUMMARY_TRUNCATE_LENGTH
        ? lesson.summary.slice(0, SUMMARY_TRUNCATE_LENGTH) + '…'
        : lesson.summary;
      return `- [${lesson.id}] ${lesson.title}: ${summary}`;
    })
    .join('\n');

  return [
    '## 既存レッスン優先ポリシー',
    '',
    `学習者は現在「${currentContext}」に取り組んでいます。`,
    '回答する前に、以下の既存レッスンにトピックをカバーするものがないか確認してください。',
    '',
    '### ルール',
    '1. 質問されたトピックを扱う既存レッスンがある場合は、そのレッスンを紹介・参照してください',
    '   - 例: 「このトピックは【レッスン名】で詳しく解説しています。まずそちらを確認してみてください。」',
    '2. 既存レッスンでカバーされていない内容のみ、独自に説明を生成してください',
    '3. 長文の解説を自前で生成する前に、必ずレッスン一覧を確認すること',
    '4. レッスンを参照する際は、レッスンIDとタイトルを明記すること',
    '',
    '### 利用可能なレッスン一覧',
    lessonList,
  ].join('\n');
}
