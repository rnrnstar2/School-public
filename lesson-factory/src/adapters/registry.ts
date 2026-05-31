import type { CritiqueAdapter, DraftAdapter, ImageAdapter, VideoAdapter } from './base.js'
import { createClaudeCritiqueAdapter, createClaudeDraftAdapter } from './claude-code/index.js'
import { createCodexCritiqueAdapter, createCodexDraftAdapter } from './codex/index.js'
import { createGeminiCritiqueAdapter, createGeminiDraftAdapter } from './gemini/index.js'
import { createGlmCritiqueAdapter, createGlmDraftAdapter } from './glm/index.js'
import { createNanoBananaImageAdapter } from './image/nano-banana.js'
import { createStubImageAdapter } from './image/stub.js'
import { createStubVideoAdapter } from './video/stub.js'
import { parseYaml, stringifyYaml } from '../core/yaml-io.js'
import type {
  Critique,
  Lesson,
  LessonDraft,
  LessonDraftInput,
} from '../core/types.js'

export type AdapterName = 'claude-code' | 'gemini' | 'mock' | 'codex' | 'glm'

interface TextAdapterOptions {
  instruction: string
  overrideName?: string
}

export function resolveDraftAdapterName(overrideName?: string): AdapterName {
  return normalizeAdapterName(
    overrideName ?? process.env.LESSON_FACTORY_DRAFT_ADAPTER ?? 'claude-code',
  )
}

export function resolveCritiqueAdapterName(overrideName?: string): AdapterName {
  return normalizeAdapterName(
    overrideName ?? process.env.LESSON_FACTORY_CRITIQUE_ADAPTER ?? 'codex',
  )
}

export function getDraftAdapter(options: TextAdapterOptions): DraftAdapter {
  const adapterName = resolveDraftAdapterName(options.overrideName)

  switch (adapterName) {
    case 'claude-code':
      return createClaudeDraftAdapter({ instruction: options.instruction })
    case 'codex':
      return createCodexDraftAdapter({ instruction: options.instruction })
    case 'gemini':
      return createGeminiDraftAdapter({ instruction: options.instruction })
    case 'glm':
      return createGlmDraftAdapter({ instruction: options.instruction })
    case 'mock':
      return createMockDraftAdapter()
  }
}

export function getCritiqueAdapter(options: TextAdapterOptions): CritiqueAdapter {
  const adapterName = resolveCritiqueAdapterName(options.overrideName)

  switch (adapterName) {
    case 'claude-code':
      return createClaudeCritiqueAdapter({ instruction: options.instruction })
    case 'codex':
      return createCodexCritiqueAdapter({ instruction: options.instruction })
    case 'gemini':
      return createGeminiCritiqueAdapter({ instruction: options.instruction })
    case 'glm':
      return createGlmCritiqueAdapter({ instruction: options.instruction })
    case 'mock':
      return createMockCritiqueAdapter()
  }
}

export function getImageAdapter(): ImageAdapter {
  return process.env.GEMINI_API_KEY
    ? createNanoBananaImageAdapter()
    : createStubImageAdapter()
}

export function getVideoAdapter(): VideoAdapter {
  return createStubVideoAdapter()
}

function normalizeAdapterName(input: string): AdapterName {
  if (
    input === 'claude-code' ||
    input === 'gemini' ||
    input === 'mock' ||
    input === 'codex' ||
    input === 'glm'
  ) {
    return input
  }

  throw new Error(`Unsupported adapter name: ${input}`)
}

function createMockDraftAdapter(): DraftAdapter {
  return {
    async draftLesson(input: LessonDraftInput): Promise<LessonDraft> {
      const lesson = buildMockLesson(input)
      const bodyTitle = lesson.title
      return {
        lesson_yaml: stringifyYaml(lesson),
        body_markdown: [
          `# ${bodyTitle}`,
          '',
          `${input.intake_bundle.goal.summary}`,
          '',
          '## Goal',
          '',
          `完成条件: ${lesson.capability_outputs.join(', ')}`,
          '',
          '## Steps',
          '',
          '1. 前提を確認する',
          '2. 最小の成果物を作る',
          '3. 検証観点で確認する',
        ].join('\n'),
        image_briefs: [],
        video_briefs: [],
        eval_cases: [
          `Can explain ${lesson.capability_outputs[0] ?? 'the lesson outcome'}`,
          `Can produce ${lesson.deliverable.type}`,
        ],
        anticipated_blockers: [
          '前提条件の確認を飛ばす',
          '検証観点を曖昧にしたまま完了扱いにする',
        ],
        pr_summary: `${lesson.title} draft generated locally with mock adapter`,
      }
    },
  }
}

function createMockCritiqueAdapter(): CritiqueAdapter {
  return {
    async critique(draft: LessonDraft): Promise<Critique> {
      const lesson = parseYaml<Lesson>(draft.lesson_yaml)
      const hasStructuredSteps = draft.body_markdown.includes('## Steps')
      return {
        lesson_id: lesson.id,
        critic_model: 'mock-critic-v1',
        issues: hasStructuredSteps
          ? [
              {
                severity: 'low',
                category: 'pedagogy',
                location: 'body_markdown > Steps',
                message: 'Add one sentence that explains why the verification step matters.',
                suggested_fix: 'Insert a short rationale before the numbered steps.',
              },
            ]
          : [
              {
                severity: 'medium',
                category: 'execution',
                location: 'body_markdown',
                message: 'Structured steps are missing.',
                suggested_fix: 'Add numbered steps for the learner path.',
              },
            ],
        overall_score: hasStructuredSteps ? 92 : 78,
        recommend_status: hasStructuredSteps ? 'accept' : 'revise',
      }
    },
  }
}

function buildMockLesson(input: LessonDraftInput): Lesson {
  const related = input.related_existing_atoms[0]
  const capability =
    input.intake_bundle.candidate_capabilities[0]?.capability ?? 'complete-owner-local-workflow'
  const lessonId = related?.id ?? `atom.mock.${slugify(capability)}`
  const title = related?.title ?? titleFromCapability(capability)
  const goalTags = buildGoalTags(input.intake_bundle.goal.summary)

  return {
    id: lessonId,
    title,
    persona_tags: uniqueStrings(
      input.intake_bundle.target_personas.map((persona) => persona.tag),
      ['owner-local'],
    ),
    goal_tags: goalTags,
    capability_inputs: related?.capability_inputs ?? ['owner-request-normalized'],
    capability_outputs: uniqueStrings([capability]),
    hard_prerequisites: related?.hard_prerequisites ?? [],
    soft_prerequisites: related?.soft_prerequisites ?? [],
    deliverable: related?.deliverable ?? {
      type: 'markdown_doc',
      validation: 'owner_local_review_v1',
    },
    evidence: related?.evidence ?? ['url'],
    media_slots: [],
    freshness_sources: uniqueStrings(
      input.intake_bundle.freshness_signals.map((signal) => signal.source),
    ),
    status: 'draft',
  }
}

function titleFromCapability(capability: string): string {
  return capability
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function buildGoalTags(summary: string): string[] {
  const words = summary
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((word) => word.length >= 4)
    .slice(0, 3)

  return uniqueStrings(words.length > 0 ? words : ['owner', 'local'])
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'lesson'
}

function uniqueStrings(values: string[], fallback: string[] = []): string[] {
  const merged = [...values, ...fallback].filter(Boolean)
  return [...new Set(merged)]
}
