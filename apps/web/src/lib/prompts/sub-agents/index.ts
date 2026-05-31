/**
 * TQ-239 sub-agent specialized prompts barrel.
 *
 * Investigator-11 R11: PLANNING_SYSTEM_PROMPT を context-distinct な軸で
 * 5+ specialization に分割。各 sub-agent はここから自分専用の prompt を
 * import する。
 *
 * 設計原則:
 * - 1 sub-agent = 1 prompt ファイル
 * - 各 prompt は THREE_AXIS_GUIDE を頂上に置き、scope discipline / output schema /
 *   CoT-leak prevention を含む
 * - prompt の wording 修正は本ディレクトリだけを触ればよい
 */

export { GOAL_TREE_SYSTEM_PROMPT } from './goal-tree-prompt'
export { TECH_SCOUT_SYSTEM_PROMPT } from './tech-scout-prompt'
export { TOOL_SCOUT_SYSTEM_PROMPT } from './tool-scout-prompt'
export { FRICTION_CRITIC_SYSTEM_PROMPT } from './friction-critic-prompt'
export { LESSON_MATCHER_SYSTEM_PROMPT } from './lesson-matcher-prompt'
export { MEMORY_RECALL_SYSTEM_PROMPT } from './memory-recall-prompt'
export { JUDGE_SYSTEM_PROMPT } from './judge-prompt'
export { TIE_BREAKER_SYSTEM_PROMPT } from './tie-breaker-prompt'
