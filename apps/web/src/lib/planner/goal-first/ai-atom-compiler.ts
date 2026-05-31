/**
 * AI-powered Atom Plan Compiler (P1)
 *
 * Uses ZAI GLM-5 to select a personalized subset of 10-20 atoms
 * for a learner's specific goal, replacing the deterministic
 * tag-matching approach with AI-driven selection.
 *
 * Falls back to null on any failure so the caller can use
 * the deterministic {@link buildAtomPlanFromGoal} instead.
 */

import {
  fetchAtomsForUserPersonas,
  fetchCurrentAtoms,
  type AtomRecord,
  type PersonaAnchorRecord,
} from '@/lib/atoms/atom-repository'
import {
  AI_TOOLS_CATALOG,
  isKnownAiToolId,
  type AiToolCatalogEntry,
} from '@/lib/atoms/ai-tools-catalog'
import { fetchWithRetry } from '@/lib/api/fetch-with-retry'
import { getExternalPlannerConfig } from '../zai'
import {
  ATOM_PLAN_COMPILATION_PROMPT,
  GOAL_TREE_DECOMPOSITION_PROMPT,
  GOAL_TREE_ATOM_MATCH_PROMPT,
} from './ai-prompts'
import { resolvePersonaAnchors } from './persona-anchor'
import { expandPersonaSlugsToTags } from '@/lib/personas/persona-tag-bridge'
import {
  topologicalSortAtomIds,
  collectHardPrerequisiteClosure,
  resolveUserPersonas,
  matchesPersona,
  matchesGoal,
  buildMilestones,
  buildPriorityMap,
  inferGoalTags,
  type AtomCompiledPlan,
  type AtomPlanStep,
  type AtomPlanMilestone,
  type BuildAtomPlanFromGoalInput,
} from './plan-compiler'
import { normalizeGoal } from './goal-normalizer'
import { classifyGoalDomains } from './domain-classifier'

// ── Constants ──

const MAX_PLAN_ATOMS = 25
const AI_TIMEOUT_MS = 30_000

/**
 * TQ-215: when set to "1" the compiler falls back to the legacy
 * single-mode path (`ATOM_PLAN_COMPILATION_PROMPT` only). The default
 * is the 2-mode pipeline: Mode A (goal tree, no catalog) → Mode B
 * (atom match + delegation filling). Used by regression tests to keep
 * the old contract callable.
 */
function isLegacySingleMode(): boolean {
  return process.env.LEGACY_SINGLE_MODE === '1'
}

// ── Types ──

interface AtomCatalogEntry {
  id: string
  title: string
  goalTags: string[]
  personaTags: string[]
  hardPrerequisites: string[]
  estimatedMinutes: number | null
  capabilityOutputs: string[]
}

interface AiAtomPlanLearnerContext {
  goal: string
  goalTags: string[]
  skillLevel: string | null
  deadline: string | null
  audience: string | null
  cliFamiliarity: string | null
  aiTools: string[]
  completedAtomIds: string[]
  blockers: string[]
  hearingKeyPoints: string[]
  mentorMemoryBullets: string[]
}

interface AiAtomPlanResponse {
  selected_atom_ids: string[]
  milestones: Array<{
    id: string
    title: string
    description: string
    atom_ids: string[]
  }>
  atom_rationales: Record<string, string>
  /**
   * TQ-220: per-atom AI tool assignment. Optional in the response — older
   * model outputs (and small/cheap models that ignore the new section) will
   * simply omit this field. Caller treats absence as "no recommendation".
   */
  atom_tool_assignments?: Record<
    string,
    {
      recommended_tool?: string | null
      delegation_brief?: string | null
    }
  >
  overall_rationale: string
  estimated_total_minutes: number
}

/**
 * TQ-220: shape of a single tool entry sent to the model. We only expose
 * the fields the model needs for selection — keep the prompt small.
 */
interface AiToolCatalogPromptEntry {
  id: string
  label: string
  category: AiToolCatalogEntry['category']
  primaryUseCases: AiToolCatalogEntry['primaryUseCases']
  nonEngineerFriendliness: AiToolCatalogEntry['nonEngineerFriendliness']
  costTier: AiToolCatalogEntry['cost']['tier']
  strengths: string[]
}

// ── TQ-215: Mode A / Mode B types ──

/**
 * Mode A output: a Goal Tree decomposed without the atom catalog.
 *
 * The shape mirrors the prompt's JSON schema. Mode B consumes this
 * verbatim and emits per-leaf assignments.
 */
export interface GoalTreeLeafTask {
  id: string
  title: string
  summary?: string
  human_judgment_required?: boolean
  automation_potential?: 'low' | 'medium' | 'high'
  recommended_capability?: string
}

export interface GoalTreeMilestone {
  id: string
  title: string
  summary?: string
  leafTasks: GoalTreeLeafTask[]
}

export interface GoalTreeObjective {
  id: string
  title: string
  summary?: string
  milestones: GoalTreeMilestone[]
}

export interface GoalTreeDecomposition {
  goal_summary?: string
  objectives: GoalTreeObjective[]
}

/**
 * Mode B output: per-leaf assignment of an existing atom OR a delegation
 * brief. `matched_atom_id === null` means "no atom — fill with the AI
 * tool delegation node".
 */
interface GoalTreeAssignment {
  leaf_task_id: string
  matched_atom_id: string | null
  match_confidence?: number | null
  recommended_tool?: string | null
  delegation_brief?: string | null
  selection_reason?: string
}

interface GoalTreeAssignmentResponse {
  assignments: GoalTreeAssignment[]
  milestone_titles?: Record<string, string>
  overall_rationale?: string
  estimated_total_minutes?: number
}

// ── Step 1: 2-Stage Atom Retrieval ──

function buildAtomCatalog(
  atoms: AtomRecord[],
  personaTags: string[],
  goalTags: string[],
): AtomCatalogEntry[] {
  return atoms
    .filter((atom) => matchesPersona(atom, personaTags))
    .filter((atom) => {
      // Include atoms that match goal OR have no goal tags (general-purpose)
      if (goalTags.length === 0) return true
      if (atom.goalTags.length === 0) return true
      return matchesGoal(atom, goalTags)
    })
    .map((atom) => ({
      id: atom.atomId,
      title: atom.title,
      goalTags: atom.goalTags,
      personaTags: atom.personaTags,
      hardPrerequisites: atom.hardPrerequisites,
      estimatedMinutes: atom.estimatedMinutes,
      capabilityOutputs: atom.capabilityOutputs,
    }))
}

/**
 * Hybrid retrieval: vector search + tag補完 + prerequisite chain自動追加.
 *
 * Stage 1A: pgvector cosine similarity で意味的に近い atom を幅広く取得 (top-150)
 * Stage 1B: ベクトル結果に含まれない「共通基礎 atom」をタグで補完
 * Stage 1C: 候補 atom の hardPrerequisites を辿り、前提 atom を自動追加
 *
 * ベクトル検索が使えない場合はタグフィルタにフォールバック。
 */
async function retrieveAtomCandidates(
  goal: string,
  personaTags: string[],
  goalTags: string[],
  allAtoms: AtomRecord[],
): Promise<{ catalog: AtomCatalogEntry[]; retrievalMethod: 'vector' | 'tag-filter' }> {
  // Stage 1A: Try vector search — 幅広く取得
  try {
    const { searchAtomsBySimilarity } = await import('@/lib/atoms/atom-embeddings')
    const vectorResults = await searchAtomsBySimilarity({
      goalText: goal,
      matchCount: 150, // 多めに取得してAIに判断を委ねる
      personaTags: personaTags.length > 0 ? personaTags : undefined,
      // goalTags フィルタは掛けない — ベクトル検索は意味的に広く拾う
    })

    if (vectorResults.length >= 5) {
      const candidateIds = new Set(vectorResults.map((r) => r.atomId))

      // Stage 1B: 共通基礎 atom の補完
      // any-web-project や stage:setup など間接的に必要な atom を追加
      const atomById = new Map(allAtoms.map((a) => [a.atomId, a]))
      for (const atom of allAtoms) {
        if (candidateIds.has(atom.atomId)) continue
        if (!matchesPersona(atom, personaTags)) continue
        // 共通基礎タグを持つ atom は常に候補に含める
        const hasFoundationTag = atom.goalTags.some(
          (t) => t === 'any-web-project' || t.startsWith('stage:setup') || t.startsWith('stage:orient'),
        )
        if (hasFoundationTag) {
          candidateIds.add(atom.atomId)
        }
      }

      // Stage 1C: Prerequisite chain 自動補完
      // 候補 atom の前提条件を辿って、必要な atom を追加
      let added = true
      while (added) {
        added = false
        for (const atomId of [...candidateIds]) {
          const atom = atomById.get(atomId)
          if (!atom) continue
          for (const prereqId of atom.hardPrerequisites) {
            if (!candidateIds.has(prereqId) && atomById.has(prereqId)) {
              candidateIds.add(prereqId)
              added = true
            }
          }
        }
      }

      const candidateAtoms = allAtoms.filter((a) => candidateIds.has(a.atomId))

      console.log(
        `[ai-atom-compiler] hybrid search: vector=${vectorResults.length} + foundation補完 + prereq補完 → ${candidateAtoms.length} candidates from ${allAtoms.length} total`,
      )

      return {
        catalog: candidateAtoms.map((atom) => ({
          id: atom.atomId,
          title: atom.title,
          goalTags: atom.goalTags,
          personaTags: atom.personaTags,
          hardPrerequisites: atom.hardPrerequisites,
          estimatedMinutes: atom.estimatedMinutes,
          capabilityOutputs: atom.capabilityOutputs,
        })),
        retrievalMethod: 'vector',
      }
    }
  } catch {
    // Vector search module not available or embeddings not populated — fall through
  }

  // Fallback: tag-based filtering
  console.log(
    `[ai-atom-compiler] tag-filter fallback: filtering ${allAtoms.length} atoms by tags`,
  )
  return {
    catalog: buildAtomCatalog(allAtoms, personaTags, goalTags),
    retrievalMethod: 'tag-filter',
  }
}

// ── Step 1.5: Build AI Tool Catalog subset (TQ-220) ──

/**
 * Build a compact catalog subset to attach to the prompt. We strip cost
 * notes / launch steps / homepage etc. that the model does not need for
 * tool selection so the prompt stays small.
 *
 * Filtering rules:
 * - cliFamiliarity が `none` または `low` の場合は nonEngineerFriendliness >= 3
 *   のエントリだけを残す（CLI 直打ち系を初手で勧めない）。
 * - それ以外は `paid-high` の高額ツール（Devin 等）を除外（個人学習者の
 *   既定では推奨しない。owner が明示で許可した場合は別 TQ で）。
 * - 学習者所有ツール (`learner_context.aiTools`) は cli_familiarity が低くても
 *   常に含める — 既に持っているツールは選択肢から外したくない。
 *
 * `freeform` カテゴリ (`other`) は常に除外（実 prompt として使えない）。
 */
export function buildToolCatalogForPrompt(
  context: { cliFamiliarity: string | null; aiTools: string[] },
): AiToolCatalogPromptEntry[] {
  const ownedToolIds = new Set(context.aiTools.filter((id) => isKnownAiToolId(id)))
  const lowCli = context.cliFamiliarity === 'none' || context.cliFamiliarity === 'low'

  return AI_TOOLS_CATALOG.filter((entry) => {
    if (entry.category === 'freeform') return false
    if (ownedToolIds.has(entry.id)) return true
    if (lowCli && entry.nonEngineerFriendliness < 3) return false
    if (entry.cost.tier === 'paid-high') return false
    return true
  }).map((entry) => ({
    id: entry.id,
    label: entry.label,
    category: entry.category,
    primaryUseCases: entry.primaryUseCases,
    nonEngineerFriendliness: entry.nonEngineerFriendliness,
    costTier: entry.cost.tier,
    strengths: entry.strengths,
  }))
}

// ── Step 2: Build Learner Context ──

function buildLearnerContext(
  input: BuildAtomPlanFromGoalInput,
  goalTags: string[],
): AiAtomPlanLearnerContext {
  const signals = (input.learnerState?.signals ?? {}) as Record<string, unknown>

  return {
    goal: input.goal,
    goalTags,
    skillLevel: input.learnerState?.skillLevel ?? null,
    deadline: typeof signals.deadline === 'string' ? signals.deadline : null,
    audience: typeof signals.audience === 'string' ? signals.audience : null,
    cliFamiliarity: typeof signals.cli_familiarity === 'string' ? signals.cli_familiarity : null,
    aiTools: Array.isArray(signals.ai_tools)
      ? signals.ai_tools.filter((t): t is string => typeof t === 'string')
      : [],
    completedAtomIds: input.completedAtomIds ?? [],
    blockers: input.learnerState?.blockers ?? [],
    hearingKeyPoints: input.hearingSummary?.keyPoints ?? [],
    mentorMemoryBullets: input.mentorMemoryBullets ?? [],
  }
}

// ── Step 3: Call ZAI for Atom Plan ──

async function callZaiForAtomPlan(
  catalog: AtomCatalogEntry[],
  learnerContext: AiAtomPlanLearnerContext,
  toolCatalog: AiToolCatalogPromptEntry[],
): Promise<AiAtomPlanResponse | null> {
  const config = getExternalPlannerConfig()

  if (!config.available) {
    return null
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

  try {
    const userMessage = JSON.stringify(
      {
        atom_catalog: catalog,
        learner_context: learnerContext,
        // TQ-220: per-step tool assignment catalog. Filtered upstream so the
        // model only sees tools that fit the learner (cliFamiliarity / cost
        // / owned tools).
        ai_tool_catalog: toolCatalog,
      },
      null,
      2,
    )

    const response = await fetchWithRetry(
      config.endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          stream: false,
          temperature: 0.2,
          top_p: 0.9,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: ATOM_PLAN_COMPILATION_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }),
        cache: 'no-store',
        signal: controller.signal,
      },
      { operation: 'ai.atom-plan-compile', maxRetries: 2 },
    )

    if (!response.ok) {
      throw new Error(`ZAI atom-plan-compile failed: ${response.status}`)
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      output_text?: string
    }

    const content =
      (typeof payload.output_text === 'string' ? payload.output_text : '') ||
      payload.choices?.[0]?.message?.content ||
      ''

    if (!content) {
      throw new Error('ZAI atom-plan-compile: empty content')
    }

    return JSON.parse(content) as AiAtomPlanResponse
  } catch (error) {
    console.warn('[ai-atom-compiler] callZaiForAtomPlan failed:', error)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * TQ-257: type guard for caller-supplied precomputed Goal Tree.
 *
 * The `BuildAtomPlanFromGoalInput.precomputedGoalTree` field is typed
 * `unknown | null` to avoid cross-module type entanglement. We validate
 * the minimal shape here so a malformed payload silently falls back to
 * "no precomputed tree" → Mode A re-runs (the previous behaviour).
 *
 * The contract checked is the same shape produced by `callZaiForGoalTree`
 * — `objectives` is an array of objects each carrying a `milestones`
 * array. We do not validate every leaf field; downstream
 * `flattenGoalTreeLeaves` handles malformed leaves defensively.
 */
function isPrecomputedGoalTree(value: unknown): value is GoalTreeDecomposition {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { objectives?: unknown }
  if (!Array.isArray(candidate.objectives)) return false
  return true
}

// ── TQ-215: Mode A — Goal Tree Decomposition (no atom catalog) ──

/**
 * Call the AI to decompose the learner's goal into a Goal Tree
 * **without** the atom catalog. The result is a structured
 * objectives → milestones → leafTasks tree, where each leaf carries
 * `recommended_capability` / `human_judgment_required` /
 * `automation_potential` so Mode B can choose an atom or AI tool.
 *
 * Returns null on any failure so the caller can fall back to the
 * legacy single-mode pipeline (or deterministic compiler).
 */
async function callZaiForGoalTree(
  learnerContext: AiAtomPlanLearnerContext,
): Promise<GoalTreeDecomposition | null> {
  const config = getExternalPlannerConfig()
  if (!config.available) return null

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

  try {
    const userMessage = JSON.stringify(
      {
        // Mode A intentionally does NOT include atom_catalog. The whole
        // point is to decompose the goal independently of what lessons
        // already exist.
        goal: learnerContext.goal,
        goal_tags: learnerContext.goalTags,
        learner_context: learnerContext,
      },
      null,
      2,
    )

    const response = await fetchWithRetry(
      config.endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          stream: false,
          temperature: 0.2,
          top_p: 0.9,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: GOAL_TREE_DECOMPOSITION_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }),
        cache: 'no-store',
        signal: controller.signal,
      },
      { operation: 'ai.goal-tree-decompose', maxRetries: 2 },
    )

    if (!response.ok) {
      throw new Error(`ZAI goal-tree-decompose failed: ${response.status}`)
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      output_text?: string
    }

    const content =
      (typeof payload.output_text === 'string' ? payload.output_text : '') ||
      payload.choices?.[0]?.message?.content ||
      ''
    if (!content) {
      throw new Error('ZAI goal-tree-decompose: empty content')
    }

    const parsed = JSON.parse(content) as GoalTreeDecomposition
    if (!parsed || !Array.isArray(parsed.objectives)) return null
    return parsed
  } catch (error) {
    console.warn('[ai-atom-compiler] callZaiForGoalTree failed:', error)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Flatten the Goal Tree into an ordered list of leaf tasks while
 * preserving the milestone they belong to. Used as the input shape for
 * Mode B and as the source of truth for plan step ordering.
 */
function flattenGoalTreeLeaves(
  tree: GoalTreeDecomposition,
): Array<{ leaf: GoalTreeLeafTask; milestoneId: string; milestoneTitle: string; objectiveId: string }> {
  const result: Array<{
    leaf: GoalTreeLeafTask
    milestoneId: string
    milestoneTitle: string
    objectiveId: string
  }> = []
  for (const objective of tree.objectives ?? []) {
    if (!objective || !Array.isArray(objective.milestones)) continue
    for (const milestone of objective.milestones) {
      if (!milestone || !Array.isArray(milestone.leafTasks)) continue
      for (const leaf of milestone.leafTasks) {
        if (!leaf || typeof leaf.id !== 'string' || typeof leaf.title !== 'string') continue
        result.push({
          leaf,
          milestoneId: milestone.id,
          milestoneTitle: milestone.title,
          objectiveId: objective.id,
        })
      }
    }
  }
  return result
}

// ── TQ-215: Mode B — Atom Match + Delegation Filling ──

async function callZaiForGoalTreeAssignment(
  tree: GoalTreeDecomposition,
  catalog: AtomCatalogEntry[],
  learnerContext: AiAtomPlanLearnerContext,
  toolCatalog: AiToolCatalogPromptEntry[],
  personaAnchors: PersonaAnchorRecord[],
  /**
   * TQ-258: persona-curated candidate atoms surfaced from
   * `fetchAtomsForUserPersonas`. These represent atoms the user is
   * eligible for based on their selected personas (anchor atoms +
   * persona-tagged atoms with `reviewed`+ status). They are passed to
   * the model in addition to the `atom_catalog` (which is the broader
   * vector / tag-filtered candidate set) so the model can prefer
   * persona-curated atoms when matching leaves.
   */
  personaCandidateAtoms: AtomCatalogEntry[],
): Promise<GoalTreeAssignmentResponse | null> {
  const config = getExternalPlannerConfig()
  if (!config.available) return null

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

  try {
    const userMessage = JSON.stringify(
      {
        goal_tree: tree,
        atom_catalog: catalog,
        ai_tool_catalog: toolCatalog,
        learner_context: learnerContext,
        // TQ-255: hand the curated persona anchor (no-code-first ordering)
        // to Mode B. The prompt instructs the model to prefer matching
        // anchor atoms onto early leaves; we additionally enforce the
        // ordering deterministically inside `assembleTwoModePlan` so a
        // mis-behaving model cannot drop the anchor.
        persona_anchors: personaAnchors.map((anchor) => ({
          anchor_id: anchor.anchorId,
          persona_id: anchor.personaId,
          ordered_atom_ids: anchor.orderedAtomIds,
          required_capabilities: anchor.requiredCapabilities,
          description: anchor.description,
        })),
        // TQ-258: persona-curated candidate atoms (from
        // `fetchAtomsForUserPersonas`). The model should treat these as a
        // strong-preference subset of atom_catalog for leaf matching —
        // they are the set the user is explicitly eligible for via their
        // persona membership. Empty array if no userId / persona unknown.
        persona_candidate_atoms: personaCandidateAtoms,
      },
      null,
      2,
    )

    const response = await fetchWithRetry(
      config.endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          stream: false,
          temperature: 0.2,
          top_p: 0.9,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: GOAL_TREE_ATOM_MATCH_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }),
        cache: 'no-store',
        signal: controller.signal,
      },
      { operation: 'ai.goal-tree-assignment', maxRetries: 2 },
    )

    if (!response.ok) {
      throw new Error(`ZAI goal-tree-assignment failed: ${response.status}`)
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      output_text?: string
    }

    const content =
      (typeof payload.output_text === 'string' ? payload.output_text : '') ||
      payload.choices?.[0]?.message?.content ||
      ''
    if (!content) {
      throw new Error('ZAI goal-tree-assignment: empty content')
    }

    const parsed = JSON.parse(content) as GoalTreeAssignmentResponse
    if (!parsed || !Array.isArray(parsed.assignments)) return null
    return parsed
  } catch (error) {
    console.warn('[ai-atom-compiler] callZaiForGoalTreeAssignment failed:', error)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Combine a Mode A Goal Tree with a Mode B assignment response into a
 * final {@link AtomCompiledPlan}. Leaf tasks that match an atom become
 * normal {@link AtomPlanStep}s. Leaf tasks without a matching atom
 * become **delegation nodes** — synthetic steps with `atomId` prefixed
 * `delegation:<leafId>` and a `recommendedTool` / `delegationBrief`
 * carrying the AI tool committed to fill the gap. This is the core
 * "lesson が足りなくても tree は作る" implementation.
 */
function assembleTwoModePlan(params: {
  tree: GoalTreeDecomposition
  assignmentResponse: GoalTreeAssignmentResponse
  atomById: Map<string, AtomRecord>
  goal: string
  goalTags: string[]
  completedAtomIds: Set<string>
  // TQ-255: persona anchors used to enforce curated ordering. May be
  // empty for unsupported personas — in that case the function behaves
  // identically to the pre-TQ-255 version.
  personaAnchors: PersonaAnchorRecord[]
}): AtomCompiledPlan {
  const { tree, assignmentResponse, atomById, goal, goalTags, completedAtomIds, personaAnchors } =
    params
  const leaves = flattenGoalTreeLeaves(tree)

  if (leaves.length === 0) {
    // Defensive — caller should fall back to legacy when tree is empty.
    return {
      goal,
      goalTags,
      steps: [],
      milestones: [],
      coverageScore: 0,
      unsupportedCapabilities: [],
      rationale: assignmentResponse.overall_rationale ?? `${goal} の Goal Tree が空でした。`,
      source: 'ai',
    }
  }

  const assignmentByLeafId = new Map<string, GoalTreeAssignment>()
  for (const a of assignmentResponse.assignments ?? []) {
    if (!a || typeof a.leaf_task_id !== 'string') continue
    assignmentByLeafId.set(a.leaf_task_id, a)
  }

  // Track milestones in encounter order. We keep Mode A's milestone IDs
  // verbatim so callers can correlate with the tree.
  const milestoneOrder: string[] = []
  const milestoneTitleById = new Map<string, string>()
  const milestoneAtomIds = new Map<string, string[]>()

  // Build steps in tree-traversal order. This makes the resulting plan
  // mirror Mode A's narrative order exactly.
  const steps: AtomPlanStep[] = []
  const usedAtomIds = new Set<string>()
  let delegationCounter = 0

  for (const { leaf, milestoneId, milestoneTitle } of leaves) {
    if (!milestoneTitleById.has(milestoneId)) {
      milestoneOrder.push(milestoneId)
      milestoneTitleById.set(
        milestoneId,
        assignmentResponse.milestone_titles?.[milestoneId] ?? milestoneTitle,
      )
      milestoneAtomIds.set(milestoneId, [])
    }

    const assignment = assignmentByLeafId.get(leaf.id)
    const rawMatched = assignment?.matched_atom_id ?? null
    const matchedAtom =
      typeof rawMatched === 'string' && atomById.has(rawMatched) && !completedAtomIds.has(rawMatched)
        ? atomById.get(rawMatched)!
        : null

    // Validate tool / brief — same defensive logic as TQ-220.
    const rawTool = assignment?.recommended_tool
    const recommendedTool =
      typeof rawTool === 'string' && rawTool.trim().length > 0 && isKnownAiToolId(rawTool.trim())
        ? rawTool.trim()
        : null
    const rawBrief = assignment?.delegation_brief
    const delegationBrief =
      typeof rawBrief === 'string' && rawBrief.trim().length > 0
        ? rawBrief.trim()
        : null

    let atomId: string
    let title: string
    let estimatedMinutes = 30
    let prerequisiteAtomIds: string[] = []
    let softPrerequisiteAtomIds: string[] = []

    if (matchedAtom && !usedAtomIds.has(matchedAtom.atomId)) {
      atomId = matchedAtom.atomId
      title = matchedAtom.title
      estimatedMinutes = matchedAtom.estimatedMinutes ?? 15
      prerequisiteAtomIds = matchedAtom.hardPrerequisites.filter(
        (id) => !completedAtomIds.has(id),
      )
      softPrerequisiteAtomIds = matchedAtom.softPrerequisites.filter(
        (id) => !completedAtomIds.has(id),
      )
      usedAtomIds.add(matchedAtom.atomId)
    } else {
      // Delegation node — atom is missing OR already used. Synthesize a
      // stable step id derived from the leaf id so the same Goal Tree
      // produces the same delegation atomIds across compiler runs.
      delegationCounter += 1
      atomId = `delegation:${leaf.id}`
      title = leaf.title
    }

    const rationale =
      assignment?.selection_reason ??
      leaf.summary ??
      (matchedAtom
        ? `「${goal}」の Goal Tree から該当 atom にマッチしました。`
        : `「${goal}」の Goal Tree から AI ツールに委譲する作業として割り当てました。`)

    const step: AtomPlanStep = {
      atomId,
      title,
      rationale,
      estimatedMinutes,
      milestoneId,
      prerequisiteAtomIds,
      softPrerequisiteAtomIds,
      completedAt: null,
      recommendedTool: recommendedTool,
      // If the tool was rejected the brief would dangle — drop it.
      delegationBrief: recommendedTool ? delegationBrief : null,
    }
    steps.push(step)
    milestoneAtomIds.get(milestoneId)?.push(atomId)
  }

  // ──────────────────────────────────────────────────────────────────
  // TQ-255: hard anchor enforcement.
  //
  // The persona anchor (e.g. anchor.web-builder.default) is the curated
  // no-code-first 5-step ordering. Auditor 2 (C17) detected that Mode B
  // historically ignored anchors entirely — the curated ordering existed
  // only as a weak prompt suggestion. We fix that here by:
  //
  //  1. For each anchor atom (in declared order) that exists in the plan
  //     already (matched by Mode B), pull it to the front so the curated
  //     ordering is preserved.
  //  2. For each anchor atom that is NOT in the plan but exists in
  //     `atomById` and is not completed, inject it at the head of the
  //     plan so the curated path is guaranteed even when Mode B skipped
  //     the obvious match.
  //
  // The anchor synthesis step uses a stable rationale so the resulting
  // step is identifiable as an anchor-injected step in tests / telemetry.
  // ──────────────────────────────────────────────────────────────────
  const anchorAtomOrder = collectAnchorAtomOrder(personaAnchors, atomById, completedAtomIds)
  let orderedSteps: AtomPlanStep[] = steps
  const injectedAnchorSteps: AtomPlanStep[] = []
  const anchorMilestoneId = milestoneOrder[0] ?? null

  if (anchorAtomOrder.length > 0) {
    const stepIndexByAtomId = new Map<string, number>()
    steps.forEach((step, idx) => stepIndexByAtomId.set(step.atomId, idx))

    const anchorStepsInOrder: AtomPlanStep[] = []
    const anchorMatchedIndices = new Set<number>()

    for (const anchorAtomId of anchorAtomOrder) {
      const idx = stepIndexByAtomId.get(anchorAtomId)
      if (typeof idx === 'number') {
        anchorStepsInOrder.push(steps[idx]!)
        anchorMatchedIndices.add(idx)
        continue
      }

      // Synthesize a step from the atom record so the curated 5-step is
      // not lost when Mode B failed to match it onto a leaf.
      const atom = atomById.get(anchorAtomId)
      if (!atom) continue
      const synthetic: AtomPlanStep = {
        atomId: atom.atomId,
        title: atom.title,
        rationale: `「${goal}」の persona anchor (no-code-first 推奨経路) の必須 step です。`,
        estimatedMinutes: atom.estimatedMinutes ?? 15,
        milestoneId: anchorMilestoneId,
        prerequisiteAtomIds: atom.hardPrerequisites.filter((id) => !completedAtomIds.has(id)),
        softPrerequisiteAtomIds: atom.softPrerequisites.filter((id) => !completedAtomIds.has(id)),
        completedAt: null,
        recommendedTool: null,
        delegationBrief: null,
      }
      anchorStepsInOrder.push(synthetic)
      injectedAnchorSteps.push(synthetic)
    }

    const remainingSteps = steps.filter((_, idx) => !anchorMatchedIndices.has(idx))
    orderedSteps = [...anchorStepsInOrder, ...remainingSteps]

    // Re-thread milestones so anchor-matched steps land in the first
    // milestone (preserving Mode A's milestone IDs but adopting the
    // anchor ordering for atom_ids).
    if (anchorMilestoneId !== null) {
      const updatedMilestoneAtomIds = new Map<string, string[]>()
      for (const mid of milestoneOrder) {
        updatedMilestoneAtomIds.set(mid, [])
      }
      for (const step of orderedSteps) {
        const targetMid = step.milestoneId ?? anchorMilestoneId
        if (!updatedMilestoneAtomIds.has(targetMid)) {
          updatedMilestoneAtomIds.set(targetMid, [])
        }
        updatedMilestoneAtomIds.get(targetMid)!.push(step.atomId)
      }
      for (const mid of milestoneOrder) {
        milestoneAtomIds.set(mid, updatedMilestoneAtomIds.get(mid) ?? [])
      }
    }
  }

  const milestones: AtomPlanMilestone[] = milestoneOrder.map((id) => ({
    id,
    title: milestoneTitleById.get(id) ?? id,
    description: milestoneTitleById.get(id) ?? id,
    atomIds: milestoneAtomIds.get(id) ?? [],
  }))

  // Coverage: how many atoms in `steps` are real (matched) vs delegation.
  const realAtomCount = orderedSteps.filter((s) => !s.atomId.startsWith('delegation:')).length
  const coverageScore =
    orderedSteps.length > 0 ? Number((realAtomCount / orderedSteps.length).toFixed(2)) : 0

  return {
    goal,
    goalTags,
    steps: orderedSteps,
    milestones,
    coverageScore,
    unsupportedCapabilities: [],
    rationale:
      assignmentResponse.overall_rationale ??
      tree.goal_summary ??
      `${goal} に向けて Goal Tree を作り、足りない部分は AI ツールに委譲しました。`,
    source: 'ai',
    telemetry: {
      scoped_count: orderedSteps.length,
      goal_match_count: realAtomCount,
      selected_count: orderedSteps.length,
      source: 'ai',
      // TQ-255: surface anchor coverage so downstream tooling can detect
      // when the curated path was disrespected.
      anchor_atom_count: anchorAtomOrder.length,
      anchor_injected_count: injectedAnchorSteps.length,
    },
  }
}

/**
 * TQ-255: build the final list of anchor atom IDs (in declared order)
 * that should appear at the head of the plan. Filters out atoms that
 * are already completed (no need to re-include) and deduplicates across
 * multiple persona anchors (first occurrence wins so the highest-weight
 * persona's curated path leads).
 *
 * Atoms NOT in `atomById` are kept (so callers can still synthesize them
 * if they end up in a future catalog refresh) but in practice the caller
 * verifies presence before injecting a synthetic step.
 */
function collectAnchorAtomOrder(
  personaAnchors: PersonaAnchorRecord[],
  atomById: Map<string, AtomRecord>,
  completedAtomIds: Set<string>,
): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const anchor of personaAnchors) {
    for (const atomId of anchor.orderedAtomIds) {
      if (typeof atomId !== 'string' || atomId.length === 0) continue
      if (seen.has(atomId)) continue
      if (completedAtomIds.has(atomId)) {
        seen.add(atomId)
        continue
      }
      // Skip atoms whose record is not in the catalog (e.g. atom not yet
      // seeded). We still mark as seen so a duplicate occurrence in a
      // later anchor does not flip the decision.
      if (!atomById.has(atomId)) {
        seen.add(atomId)
        continue
      }
      seen.add(atomId)
      ordered.push(atomId)
    }
  }
  return ordered
}

// ── Step 4: Validate AI Response ──

function validateAiAtomPlanResponse(
  response: AiAtomPlanResponse,
  atomById: Map<string, AtomRecord>,
  completedAtomIds: Set<string>,
): string[] | null {
  if (!response || typeof response !== 'object') {
    return null
  }

  if (!Array.isArray(response.selected_atom_ids) || response.selected_atom_ids.length === 0) {
    return null
  }

  // Filter to only valid, existing atom IDs
  const validAtomIds = response.selected_atom_ids.filter(
    (id) => typeof id === 'string' && atomById.has(id),
  )

  if (validAtomIds.length === 0) {
    return null
  }

  // Ensure prerequisite closure (add any missing hard prerequisites)
  const withPrereqs = collectHardPrerequisiteClosure(validAtomIds, atomById, completedAtomIds)

  // Enforce MAX_PLAN_ATOMS
  if (withPrereqs.length > MAX_PLAN_ATOMS) {
    return withPrereqs.slice(0, MAX_PLAN_ATOMS)
  }

  // Topological sort to ensure valid ordering
  try {
    const sorted = topologicalSortAtomIds({
      atomIds: withPrereqs,
      atomById,
      priorityByAtomId: buildPriorityMap(validAtomIds),
    })
    return sorted
  } catch {
    // Cyclic dependency — return null to fall back
    console.warn('[ai-atom-compiler] topological sort failed (cyclic prerequisites)')
    return null
  }
}

// ── Step 5: Assemble AtomCompiledPlan ──

function assembleAtomCompiledPlan(
  sortedAtomIds: string[],
  atomById: Map<string, AtomRecord>,
  aiResponse: AiAtomPlanResponse,
  goal: string,
  goalTags: string[],
  completedAtomIds: Set<string>,
): AtomCompiledPlan {
  const selectedAtoms = sortedAtomIds
    .filter((id) => !completedAtomIds.has(id))
    .map((id) => atomById.get(id))
    .filter((atom): atom is AtomRecord => Boolean(atom))

  // Use AI milestones if valid, otherwise fall back to auto-generated
  const aiMilestoneAtomIds = new Set(
    (aiResponse.milestones ?? []).flatMap((ms) => ms.atom_ids ?? []),
  )
  const selectedAtomIdSet = new Set(selectedAtoms.map((a) => a.atomId))
  const allAiAtomsInPlan =
    aiResponse.milestones?.length > 0 &&
    [...aiMilestoneAtomIds].every((id) => selectedAtomIdSet.has(id))

  let milestones: AtomCompiledPlan['milestones']
  let milestoneIdByAtomId: Map<string, string>

  if (allAiAtomsInPlan && aiResponse.milestones.length >= 2) {
    // Use AI-generated milestones
    milestones = aiResponse.milestones.map((ms) => ({
      id: ms.id,
      title: ms.title,
      description: ms.description,
      atomIds: ms.atom_ids.filter((id) => selectedAtomIdSet.has(id)),
    }))

    // Add any atoms not covered by AI milestones
    const coveredIds = new Set(milestones.flatMap((ms) => ms.atomIds))
    const uncovered = selectedAtoms.filter((a) => !coveredIds.has(a.atomId))
    if (uncovered.length > 0) {
      const lastMilestone = milestones[milestones.length - 1]
      if (lastMilestone) {
        lastMilestone.atomIds.push(...uncovered.map((a) => a.atomId))
      }
    }

    milestoneIdByAtomId = new Map(
      milestones.flatMap((ms) => ms.atomIds.map((id) => [id, ms.id] as const)),
    )
  } else {
    // Fall back to auto-generated milestones
    const result = buildMilestones(selectedAtoms)
    milestones = result.milestones
    milestoneIdByAtomId = result.milestoneIdByAtomId
  }

  const rationales = aiResponse.atom_rationales ?? {}
  // TQ-220: validate AI-supplied tool assignments. Drop unknown tool ids
  // silently (catalog drift / hallucinated id) so the plan persists with
  // recommendedTool=null instead of an invalid string.
  const rawToolAssignments = aiResponse.atom_tool_assignments ?? {}
  const toolAssignments = new Map<string, { recommendedTool: string | null; delegationBrief: string | null }>()
  for (const [atomId, assignment] of Object.entries(rawToolAssignments)) {
    if (!assignment || typeof assignment !== 'object') continue
    const rawTool = assignment.recommended_tool
    const rawBrief = assignment.delegation_brief
    const recommendedTool =
      typeof rawTool === 'string' && rawTool.trim().length > 0 && isKnownAiToolId(rawTool.trim())
        ? rawTool.trim()
        : null
    const delegationBrief =
      typeof rawBrief === 'string' && rawBrief.trim().length > 0
        ? rawBrief.trim()
        : null
    // If the tool was rejected, also drop the brief — it would dangle.
    toolAssignments.set(atomId, {
      recommendedTool,
      delegationBrief: recommendedTool ? delegationBrief : null,
    })
  }

  const steps: AtomPlanStep[] = selectedAtoms.map((atom) => {
    const assignment = toolAssignments.get(atom.atomId)
    return {
      atomId: atom.atomId,
      title: atom.title,
      rationale:
        rationales[atom.atomId] ??
        `「${goal}」達成のためにAIが選定した atom です。`,
      estimatedMinutes: atom.estimatedMinutes ?? 15,
      milestoneId: milestoneIdByAtomId.get(atom.atomId) ?? null,
      prerequisiteAtomIds: atom.hardPrerequisites.filter((id) => !completedAtomIds.has(id)),
      softPrerequisiteAtomIds: atom.softPrerequisites.filter((id) => !completedAtomIds.has(id)),
      completedAt: null,
      recommendedTool: assignment?.recommendedTool ?? null,
      delegationBrief: assignment?.delegationBrief ?? null,
    }
  })

  const coveredGoalTags = new Set(
    selectedAtoms.flatMap((a) => a.goalTags).filter((t) => goalTags.includes(t)),
  )
  const coverageScore =
    goalTags.length > 0
      ? Number(Math.max(0, Math.min(1, coveredGoalTags.size / goalTags.length)).toFixed(2))
      : 0

  return {
    goal,
    goalTags,
    steps,
    milestones,
    coverageScore,
    unsupportedCapabilities: [],
    rationale:
      aiResponse.overall_rationale ??
      `${goal} に向けて、AIが最適な atom を選定しました。`,
    source: 'ai',
  }
}

// ── Step 6: Main Export ──

/**
 * Shared preparation step for both pipeline modes — resolves goal tags,
 * personas, atoms, candidate catalog, learner context, and tool catalog.
 *
 * Returns `null` if any precondition fails (no AI config / empty catalog
 * etc.) so the caller can fall back to the deterministic compiler.
 */
async function prepareAtomCompilerContext(input: BuildAtomPlanFromGoalInput): Promise<{
  normalizedGoalSummary: string
  goalTags: string[]
  catalog: AtomCatalogEntry[]
  atomById: Map<string, AtomRecord>
  completedAtomIds: Set<string>
  learnerContext: AiAtomPlanLearnerContext
  toolCatalog: AiToolCatalogPromptEntry[]
  // TQ-255: resolved persona anchors. Mode B uses these as a hard
  // ordering constraint so the curated 5-step "no-code-first" path is
  // not lost in AI-driven leaf assignment. Empty array if no anchor
  // resolved (e.g. unsupported persona).
  personaAnchors: PersonaAnchorRecord[]
  // TQ-258: persona-curated candidate atoms (output of
  // `fetchAtomsForUserPersonas`). Mode B prompts get this as a strong-
  // preference subset of `catalog`. Empty array when userId is null or
  // when fetch fails (best-effort — never blocks the pipeline).
  personaCandidateAtoms: AtomCatalogEntry[]
} | null> {
  const config = getExternalPlannerConfig()
  if (!config.available) return null

  const normalizedGoal = normalizeGoal(input.goal)
  const domains = classifyGoalDomains(normalizedGoal)

  const goalTags =
    input.goalTags && input.goalTags.length > 0
      ? input.goalTags
      : inferGoalTags(normalizedGoal, domains, {
          hearingKeyPoints: input.hearingSummary?.keyPoints,
          personaIds: input.personaIds,
          mentorMemoryBullets: input.mentorMemoryBullets,
          blockers: input.learnerState?.blockers,
        })

  const userPersonas = await resolveUserPersonas({
    userId: input.userId,
    domains,
    explicitPersonaIds: input.personaIds,
  })
  // W58 (Audit G3): persona slug を atom personaTags 名前空間へ展開する。
  // `persona.ai-content-creator` → `[video-creator, ai-content-creator]` 等で
  // anchor が指す atom 群が persona-tag mismatch で 0 件にならないようにする。
  const personaTags = expandPersonaSlugsToTags(userPersonas)

  const atoms = await fetchCurrentAtoms({ minStatus: 'draft' })
  const atomById = new Map(atoms.map((atom) => [atom.atomId, atom]))
  const completedAtomIds = new Set(input.completedAtomIds ?? [])

  const { catalog, retrievalMethod } = await retrieveAtomCandidates(
    input.goal,
    personaTags,
    goalTags,
    atoms,
  )

  if (catalog.length === 0) return null

  console.log(
    `[ai-atom-compiler] retrieval=${retrievalMethod}, candidates=${catalog.length}, total=${atoms.length}`,
  )

  const learnerContext = buildLearnerContext(input, goalTags)
  const toolCatalog = buildToolCatalogForPrompt({
    cliFamiliarity: learnerContext.cliFamiliarity,
    aiTools: learnerContext.aiTools,
  })

  // TQ-255: resolve persona anchors so Mode B can hard-prioritize the
  // curated "no-code-first" 5-step ordering. Tolerate failures — anchors
  // are an enhancement, not a blocker.
  let personaAnchors: PersonaAnchorRecord[] = []
  try {
    personaAnchors = await resolvePersonaAnchors(userPersonas)
  } catch (error) {
    console.warn('[ai-atom-compiler] resolvePersonaAnchors failed:', error)
    personaAnchors = []
  }

  // TQ-258: hydrate persona-curated candidate atoms via
  // `fetchAtomsForUserPersonas`. This is the **persona-based atom
  // retrieval** path (Auditor 2 C20 — function existed but was unwired).
  // The result is passed to Mode B as a strong-preference subset so the
  // model prefers persona-curated atoms when matching leaves. Best-effort:
  // any failure (no userId / Supabase outage / RLS reject) yields an
  // empty array and the pipeline continues with the broader catalog.
  let personaCandidateAtoms: AtomCatalogEntry[] = []
  if (input.userId) {
    try {
      const personaResult = await fetchAtomsForUserPersonas(input.userId)
      // Reuse the catalog projection so prompt shape is identical to
      // `atom_catalog`. Filter to atoms still present in `atomById` so
      // the model cannot pick a stale id (e.g. atom archived between
      // fetches).
      personaCandidateAtoms = personaResult.atoms
        .filter((atom) => atomById.has(atom.atomId))
        .map((atom) => ({
          id: atom.atomId,
          title: atom.title,
          goalTags: atom.goalTags,
          personaTags: atom.personaTags,
          hardPrerequisites: atom.hardPrerequisites,
          estimatedMinutes: atom.estimatedMinutes,
          capabilityOutputs: atom.capabilityOutputs,
        }))
      console.log(
        `[ai-atom-compiler] persona-curated candidates=${personaCandidateAtoms.length} for userId=${input.userId}`,
      )
    } catch (error) {
      console.warn('[ai-atom-compiler] fetchAtomsForUserPersonas failed:', error)
      personaCandidateAtoms = []
    }
  }

  return {
    normalizedGoalSummary: normalizedGoal.outcome_summary,
    goalTags,
    catalog,
    atomById,
    completedAtomIds,
    learnerContext,
    toolCatalog,
    personaAnchors,
    personaCandidateAtoms,
  }
}

/**
 * Legacy single-mode pipeline (TQ-220 era). Kept callable behind
 * `LEGACY_SINGLE_MODE=1` env flag for regression. Asks the model in one
 * shot to "select atoms from the catalog and assign tools".
 */
async function buildAtomPlanFromGoalWithAILegacy(
  input: BuildAtomPlanFromGoalInput,
): Promise<AtomCompiledPlan | null> {
  const ctx = await prepareAtomCompilerContext(input)
  if (!ctx) return null

  const aiResponse = await callZaiForAtomPlan(ctx.catalog, ctx.learnerContext, ctx.toolCatalog)
  if (!aiResponse) return null

  const sortedAtomIds = validateAiAtomPlanResponse(aiResponse, ctx.atomById, ctx.completedAtomIds)
  if (!sortedAtomIds || sortedAtomIds.length === 0) return null

  return assembleAtomCompiledPlan(
    sortedAtomIds,
    ctx.atomById,
    aiResponse,
    ctx.normalizedGoalSummary,
    ctx.goalTags,
    ctx.completedAtomIds,
  )
}

/**
 * TQ-215 default pipeline: 2-mode plan generation.
 *
 * Mode A: ask the AI to decompose the goal into a Goal Tree **without**
 *         the atom catalog. Output is a tree of objectives → milestones
 *         → leaf tasks where each leaf carries `recommended_capability`,
 *         `human_judgment_required`, `automation_potential`.
 * Mode B: ask the AI to assign each leaf either an existing atom OR a
 *         delegation node (recommended_tool + delegation_brief). Atoms
 *         that are not in the catalog become delegation nodes — this is
 *         intentional. "lesson が足りなくても tree は作る" の core 実装。
 *
 * Falls back to null on any failure so the caller can use the legacy
 * pipeline or the deterministic compiler. Returning null keeps backward
 * compatibility with TQ-220 contract tests (no breaking change).
 */
async function buildAtomPlanFromGoalWithAITwoMode(
  input: BuildAtomPlanFromGoalInput,
): Promise<AtomCompiledPlan | null> {
  const ctx = await prepareAtomCompilerContext(input)
  if (!ctx) return null

  // TQ-257: Mode A 1 回化 — caller (Conductor SYNTH delegate) が SCOPING
  // phase で算出済みの Goal Tree を渡してきた場合は Mode A を skip して
  // そのまま使う。Auditor 2 C19 の「Mode A が SYNTH 内で再走する」 dead
  // re-call を解消する。precomputedGoalTree が無い (legacy caller / API
  // route 直叩き) 場合は従来どおり Mode A を実行する。
  let tree = isPrecomputedGoalTree(input.precomputedGoalTree)
    ? input.precomputedGoalTree
    : null
  if (!tree) {
    // Mode A — decompose goal into tree (no catalog).
    tree = await callZaiForGoalTree(ctx.learnerContext)
  }
  if (!tree) return null

  const leaves = flattenGoalTreeLeaves(tree)
  if (leaves.length === 0) {
    console.warn('[ai-atom-compiler] Mode A returned empty leaf set, falling back')
    return null
  }

  // Mode B — match each leaf with an atom OR a delegation tool.
  const assignmentResponse = await callZaiForGoalTreeAssignment(
    tree,
    ctx.catalog,
    ctx.learnerContext,
    ctx.toolCatalog,
    ctx.personaAnchors,
    ctx.personaCandidateAtoms,
  )
  if (!assignmentResponse) return null

  return assembleTwoModePlan({
    tree,
    assignmentResponse,
    atomById: ctx.atomById,
    goal: ctx.normalizedGoalSummary,
    goalTags: ctx.goalTags,
    completedAtomIds: ctx.completedAtomIds,
    personaAnchors: ctx.personaAnchors,
  })
}

/**
 * Build a personalized atom plan using AI.
 *
 * TQ-215: routes to the 2-mode pipeline by default. When
 * `LEGACY_SINGLE_MODE=1` env is set, falls back to the TQ-220 single
 * shot pipeline (atom catalog selection + per-atom tool assignment in
 * one call) for regression.
 *
 * Returns null on any failure so the caller can fall back to the
 * deterministic {@link buildAtomPlanFromGoal}.
 */
export async function buildAtomPlanFromGoalWithAI(
  input: BuildAtomPlanFromGoalInput,
): Promise<AtomCompiledPlan | null> {
  try {
    if (isLegacySingleMode()) {
      return await buildAtomPlanFromGoalWithAILegacy(input)
    }

    const twoModePlan = await buildAtomPlanFromGoalWithAITwoMode(input)
    if (twoModePlan && twoModePlan.steps.length > 0) {
      return twoModePlan
    }

    // 2-mode pipeline returned null or an empty plan — fall back to the
    // legacy single-mode path. This preserves the TQ-220 contract that
    // an AI plan is returned whenever the catalog is non-empty.
    console.warn('[ai-atom-compiler] 2-mode pipeline empty, falling back to legacy single-mode')
    return await buildAtomPlanFromGoalWithAILegacy(input)
  } catch (error) {
    console.warn('[ai-atom-compiler] buildAtomPlanFromGoalWithAI failed:', error)
    return null
  }
}

// TQ-215: exported for tests. The 2-mode pipeline is otherwise reached
// via `buildAtomPlanFromGoalWithAI()`.
export {
  buildAtomPlanFromGoalWithAITwoMode,
  buildAtomPlanFromGoalWithAILegacy,
  flattenGoalTreeLeaves,
}

/**
 * TQ-229: re-export for the Goal-Tree Decomposer sub-agent
 * (`apps/web/src/lib/mentor/sub-agents/goal-tree.ts`).
 *
 * The sub-agent is a thin wrapper that delegates the actual LLM call to
 * this function, so we avoid a Phase-2 rewrite of the provider client.
 * The double-underscore prefix marks it as **internal** — callers other
 * than the sub-agent should keep using `buildAtomPlanFromGoalWithAI()`.
 *
 * The shape of the `learnerContext` argument is kept structural (loose)
 * here to avoid leaking the private `AiAtomPlanLearnerContext` type
 * across module boundaries. Sub-agent fills in the fields it knows about.
 */
export const __callZaiForGoalTreeForSubAgent: (
  learnerContext: {
    goal: string
    goalTags: string[]
    skillLevel: string | null
    deadline: string | null
    audience: string | null
    cliFamiliarity: string | null
    aiTools: string[]
    completedAtomIds: string[]
    blockers: string[]
    hearingKeyPoints: string[]
    mentorMemoryBullets: string[]
  },
) => Promise<GoalTreeDecomposition | null> = callZaiForGoalTree
