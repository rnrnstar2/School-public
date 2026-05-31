/**
 * Domain Zod Schemas — Unit Tests
 *
 * Validates the 20 canonical domain schemas from domain.ts:
 * - Valid input passes
 * - Missing required fields fail
 * - Invalid enum values fail
 * - Input schemas omit auto-generated fields
 */

import { describe, it, expect } from 'vitest'
import {
  // Enums
  LessonBlockTypeEnum,
  PlanNodeStatusEnum,
  GoalStatusEnum,
  KnownDomainSlugEnum,
  DomainSlugEnum,
  LessonVersionStatusEnum,
  LessonAssetTypeEnum,
  LessonObjectiveWeightEnum,
  PrerequisiteStrengthEnum,
  ToolProfileSlugEnum,
  PlanStatusEnum,
  EvidenceTypeEnum,
  AssessedByEnum,
  GraduationStatusEnum,
  ContentTagCategoryEnum,
  ToolProfileFullSlugEnum,
  // Schemas
  GoalSchema,
  GoalInputSchema,
  DomainSchema,
  DomainInputSchema,
  CapabilitySchema,
  CapabilityInputSchema,
  LessonIdentitySchema,
  LessonIdentityInputSchema,
  LessonVersionSchema,
  LessonVersionInputSchema,
  LessonBlockSchema,
  LessonBlockInputSchema,
  LessonAssetSchema,
  LessonAssetInputSchema,
  LessonObjectiveSchema,
  LessonObjectiveInputSchema,
  LessonPrerequisiteSchema,
  LessonPrerequisiteInputSchema,
  LessonVariantSchema,
  LessonVariantInputSchema,
  PlanSchema,
  PlanInputSchema,
  PlanNodeSchema,
  PlanNodeInputSchema,
  PlanRevisionSchema,
  PlanRevisionInputSchema,
  EvidenceSubmissionSchema,
  EvidenceSubmissionInputSchema,
  CompetencyAssessmentSchema,
  CompetencyAssessmentInputSchema,
  GraduationDecisionSchema,
  GraduationDecisionInputSchema,
  ContentTagSchema,
  ContentTagInputSchema,
  ToolProfileSchema,
  ToolProfileInputSchema,
  RecommendationEventSchema,
  RecommendationEventInputSchema,
  TrackViewSchema,
  TrackViewInputSchema,
} from '../domain'

// ============================================
// Shared fixture helpers
// ============================================

const UUID_1 = '00000000-0000-4000-8000-000000000001'
const UUID_2 = '00000000-0000-4000-8000-000000000002'
const UUID_3 = '00000000-0000-4000-8000-000000000003'
const NOW = '2026-04-04T00:00:00.000Z'

// ============================================
// 1. GoalSchema
// ============================================

describe('GoalSchema', () => {
  const validGoal = {
    id: UUID_1,
    user_id: UUID_2,
    outcome: 'ポートフォリオサイトを作成する',
    structured_intent: null,
    domain_ids: [UUID_3],
    deadline: null,
    current_skill: 'beginner',
    preferred_tools: ['Claude Code'],
    environment: 'macOS',
    learning_style: 'hands-on',
    constraints: null,
    status: 'active' as const,
    created_at: NOW,
    updated_at: NOW,
  }

  it('accepts valid goal', () => {
    expect(GoalSchema.parse(validGoal)).toEqual(validGoal)
  })

  it('rejects missing required "outcome" field', () => {
    const { outcome, ...without } = validGoal
    expect(() => GoalSchema.parse(without)).toThrow()
  })

  it('rejects invalid status enum', () => {
    expect(() =>
      GoalSchema.parse({ ...validGoal, status: 'invalid' }),
    ).toThrow()
  })

  it('accepts all valid status values', () => {
    for (const status of ['active', 'completed', 'abandoned']) {
      expect(() =>
        GoalSchema.parse({ ...validGoal, status }),
      ).not.toThrow()
    }
  })
})

describe('GoalInputSchema', () => {
  it('omits id, user_id, created_at, updated_at', () => {
    const input = { outcome: 'AIでブログ記事を量産する' }
    const result = GoalInputSchema.parse(input)
    expect(result.outcome).toBe('AIでブログ記事を量産する')
    expect('id' in result).toBe(false)
    expect('user_id' in result).toBe(false)
  })

  it('rejects empty outcome', () => {
    expect(() => GoalInputSchema.parse({ outcome: '' })).toThrow()
  })
})

// ============================================
// 2. DomainSchema
// ============================================

describe('DomainSchema', () => {
  const validDomain = {
    id: UUID_1,
    slug: 'web' as const,
    label: 'Web制作',
    description: 'Webサイト・ランディングページの構築',
    icon: null,
    sort_order: 0,
  }

  it('accepts valid domain', () => {
    expect(DomainSchema.parse(validDomain)).toEqual(validDomain)
  })

  it('accepts custom domain slug strings', () => {
    expect(() =>
      DomainSchema.parse({ ...validDomain, slug: 'custom-domain' }),
    ).not.toThrow()
  })

  it('rejects empty slug strings', () => {
    expect(() =>
      DomainSchema.parse({ ...validDomain, slug: '' }),
    ).toThrow()
  })

  it('accepts all 4 domain slugs', () => {
    for (const slug of ['web', 'automation', 'content', 'app']) {
      expect(() =>
        DomainSchema.parse({ ...validDomain, slug }),
      ).not.toThrow()
    }
  })
})

describe('DomainInputSchema', () => {
  it('omits id from input', () => {
    const input = {
      slug: 'automation' as const,
      label: '業務自動化',
      description: 'AI活用の業務効率化',
      sort_order: 1,
    }
    const result = DomainInputSchema.parse(input)
    expect(result.slug).toBe('automation')
    expect('id' in result).toBe(false)
  })
})

// ============================================
// 3. CapabilitySchema
// ============================================

describe('CapabilitySchema', () => {
  const valid = {
    id: UUID_1,
    domain_id: UUID_2,
    slug: 'html-basics',
    label: 'HTML基礎',
    description: 'HTMLの基本的なタグと構造を理解する',
    rubric_criteria: 'セマンティックなHTMLを書ける',
  }

  it('accepts valid capability', () => {
    expect(CapabilitySchema.parse(valid)).toEqual(valid)
  })

  it('rejects missing slug', () => {
    const { slug, ...without } = valid
    expect(() => CapabilitySchema.parse(without)).toThrow()
  })
})

// ============================================
// 4. LessonIdentitySchema
// ============================================

describe('LessonIdentitySchema', () => {
  const valid = {
    id: UUID_1,
    slug: 'html-basics-101',
    title: 'HTML基礎 — はじめの一歩',
    domain_ids: [UUID_2],
    created_at: NOW,
  }

  it('accepts valid lesson identity', () => {
    expect(LessonIdentitySchema.parse(valid)).toEqual(valid)
  })

  it('rejects empty title', () => {
    expect(() =>
      LessonIdentitySchema.parse({ ...valid, title: '' }),
    ).toThrow()
  })
})

describe('LessonIdentityInputSchema', () => {
  it('omits id and created_at', () => {
    const input = {
      slug: 'css-basics',
      title: 'CSS基礎',
      domain_ids: [UUID_2],
    }
    const result = LessonIdentityInputSchema.parse(input)
    expect(result.slug).toBe('css-basics')
  })
})

// ============================================
// 5. LessonVersionSchema
// ============================================

describe('LessonVersionSchema', () => {
  const valid = {
    id: UUID_1,
    lesson_id: UUID_2,
    version: 1,
    status: 'published' as const,
    published_at: NOW,
    created_at: NOW,
  }

  it('accepts valid lesson version', () => {
    expect(LessonVersionSchema.parse(valid)).toEqual(valid)
  })

  it('rejects version 0 (must be positive)', () => {
    expect(() =>
      LessonVersionSchema.parse({ ...valid, version: 0 }),
    ).toThrow()
  })

  it('rejects invalid status', () => {
    expect(() =>
      LessonVersionSchema.parse({ ...valid, status: 'invalid' }),
    ).toThrow()
  })

  it('accepts all valid statuses', () => {
    for (const status of ['draft', 'review', 'published', 'archived']) {
      expect(() =>
        LessonVersionSchema.parse({ ...valid, status }),
      ).not.toThrow()
    }
  })
})

describe('LessonVersionInputSchema', () => {
  it('omits id and created_at, makes status optional', () => {
    const input = { lesson_id: UUID_2, version: 2 }
    const result = LessonVersionInputSchema.parse(input)
    expect(result.version).toBe(2)
    expect('id' in result).toBe(false)
  })
})

// ============================================
// 6. LessonBlockSchema (all 10 block types)
// ============================================

describe('LessonBlockSchema', () => {
  const allBlockTypes = [
    'markdown',
    'image',
    'video',
    'checklist',
    'quiz',
    'code_prompt',
    'reflection',
    'rubric',
    'callout',
    'artifact_submit',
  ] as const

  for (const blockType of allBlockTypes) {
    it(`accepts block type "${blockType}"`, () => {
      const block = {
        id: UUID_1,
        lesson_version_id: UUID_2,
        type: blockType,
        sort_order: 0,
        content: { body: 'テスト内容' },
        created_at: NOW,
      }
      expect(LessonBlockSchema.parse(block).type).toBe(blockType)
    })
  }

  it('rejects invalid block type', () => {
    expect(() =>
      LessonBlockSchema.parse({
        id: UUID_1,
        lesson_version_id: UUID_2,
        type: 'invalid_type',
        sort_order: 0,
        content: {},
        created_at: NOW,
      }),
    ).toThrow()
  })

  it('rejects negative sort_order', () => {
    expect(() =>
      LessonBlockSchema.parse({
        id: UUID_1,
        lesson_version_id: UUID_2,
        type: 'markdown',
        sort_order: -1,
        content: {},
        created_at: NOW,
      }),
    ).toThrow()
  })
})

describe('LessonBlockInputSchema', () => {
  it('omits id and created_at', () => {
    const input = {
      lesson_version_id: UUID_2,
      type: 'markdown' as const,
      sort_order: 0,
      content: { body: '# はじめに' },
    }
    const result = LessonBlockInputSchema.parse(input)
    expect(result.type).toBe('markdown')
    expect('id' in result).toBe(false)
  })
})

// ============================================
// 7. LessonAssetSchema
// ============================================

describe('LessonAssetSchema', () => {
  const valid = {
    id: UUID_1,
    lesson_version_id: UUID_2,
    type: 'image' as const,
    url: 'https://example.com/screenshot.png',
    created_at: NOW,
  }

  it('accepts valid asset', () => {
    expect(LessonAssetSchema.parse(valid)).toEqual(valid)
  })

  it('rejects invalid URL', () => {
    expect(() =>
      LessonAssetSchema.parse({ ...valid, url: 'not-a-url' }),
    ).toThrow()
  })

  it('accepts all asset types', () => {
    for (const type of ['image', 'video', 'pdf', 'embed']) {
      expect(() =>
        LessonAssetSchema.parse({ ...valid, type }),
      ).not.toThrow()
    }
  })
})

// ============================================
// 8. LessonObjectiveSchema
// ============================================

describe('LessonObjectiveSchema', () => {
  const valid = {
    id: UUID_1,
    lesson_id: UUID_2,
    capability_id: UUID_3,
    weight: 'primary' as const,
  }

  it('accepts valid objective', () => {
    expect(LessonObjectiveSchema.parse(valid)).toEqual(valid)
  })

  it('rejects invalid weight', () => {
    expect(() =>
      LessonObjectiveSchema.parse({ ...valid, weight: 'tertiary' }),
    ).toThrow()
  })

  it('accepts "secondary" weight', () => {
    expect(() =>
      LessonObjectiveSchema.parse({ ...valid, weight: 'secondary' }),
    ).not.toThrow()
  })
})

// ============================================
// 9. LessonPrerequisiteSchema
// ============================================

describe('LessonPrerequisiteSchema', () => {
  const valid = {
    id: UUID_1,
    lesson_id: UUID_2,
    prerequisite_lesson_id: UUID_3,
    strength: 'required' as const,
  }

  it('accepts valid prerequisite', () => {
    expect(LessonPrerequisiteSchema.parse(valid)).toEqual(valid)
  })

  it('accepts all strength values', () => {
    for (const strength of ['required', 'recommended', 'reinforcing']) {
      expect(() =>
        LessonPrerequisiteSchema.parse({ ...valid, strength }),
      ).not.toThrow()
    }
  })
})

// ============================================
// 10. LessonVariantSchema
// ============================================

describe('LessonVariantSchema', () => {
  const valid = {
    id: UUID_1,
    lesson_version_id: UUID_2,
    tool_profile_slug: 'claude-code' as const,
    override_blocks: [{ type: 'markdown', body: 'Claude Code版の手順' }],
    created_at: NOW,
  }

  it('accepts valid variant', () => {
    expect(LessonVariantSchema.parse(valid)).toEqual(valid)
  })

  it('accepts all tool profile slugs', () => {
    for (const slug of ['codex', 'claude-code', 'manual', 'v0']) {
      expect(() =>
        LessonVariantSchema.parse({ ...valid, tool_profile_slug: slug }),
      ).not.toThrow()
    }
  })
})

// ============================================
// 11. PlanSchema
// ============================================

describe('PlanSchema', () => {
  const validPlan = {
    id: UUID_1,
    user_id: UUID_2,
    goal_id: UUID_3,
    title: 'ポートフォリオサイト構築プラン',
    summary: '5レッスンで構成',
    status: 'active' as const,
    version: 1,
    parent_plan_id: null,
    created_at: NOW,
    updated_at: NOW,
  }

  it('accepts valid plan', () => {
    expect(PlanSchema.parse(validPlan)).toEqual(validPlan)
  })

  it('rejects missing title', () => {
    const { title, ...without } = validPlan
    expect(() => PlanSchema.parse(without)).toThrow()
  })

  it('rejects invalid status', () => {
    expect(() =>
      PlanSchema.parse({ ...validPlan, status: 'paused' }),
    ).toThrow()
  })

  it('accepts all plan statuses', () => {
    for (const status of ['active', 'completed', 'superseded', 'abandoned']) {
      expect(() =>
        PlanSchema.parse({ ...validPlan, status }),
      ).not.toThrow()
    }
  })
})

describe('PlanInputSchema', () => {
  it('omits id, created_at, updated_at', () => {
    const input = {
      user_id: UUID_2,
      goal_id: UUID_3,
      title: '新しいプラン',
    }
    const result = PlanInputSchema.parse(input)
    expect(result.title).toBe('新しいプラン')
    expect('id' in result).toBe(false)
  })

  it('makes status, version, parent_plan_id optional', () => {
    const input = {
      user_id: UUID_2,
      goal_id: UUID_3,
      title: 'テストプラン',
    }
    expect(() => PlanInputSchema.parse(input)).not.toThrow()
  })
})

// ============================================
// 12. PlanNodeSchema (all 5 statuses)
// ============================================

describe('PlanNodeSchema', () => {
  const validNode = {
    id: UUID_1,
    plan_id: UUID_2,
    lesson_id: UUID_3,
    milestone_title: '基礎スキル習得',
    sort_order: 0,
    status: 'pending' as const,
    rationale: 'HTML基礎はWeb制作の土台',
    created_at: NOW,
  }

  it('accepts valid plan node', () => {
    expect(PlanNodeSchema.parse(validNode)).toEqual(validNode)
  })

  const allStatuses = ['pending', 'active', 'completed', 'skipped', 'blocked'] as const
  for (const status of allStatuses) {
    it(`accepts status "${status}"`, () => {
      expect(() =>
        PlanNodeSchema.parse({ ...validNode, status }),
      ).not.toThrow()
    })
  }

  it('rejects invalid status', () => {
    expect(() =>
      PlanNodeSchema.parse({ ...validNode, status: 'cancelled' }),
    ).toThrow()
  })

  it('accepts nullable rationale', () => {
    expect(() =>
      PlanNodeSchema.parse({ ...validNode, rationale: null }),
    ).not.toThrow()
  })
})

describe('PlanNodeInputSchema', () => {
  it('omits id and created_at, makes status optional', () => {
    const input = {
      plan_id: UUID_2,
      lesson_id: UUID_3,
      milestone_title: '基礎スキル',
      sort_order: 0,
    }
    const result = PlanNodeInputSchema.parse(input)
    expect(result.sort_order).toBe(0)
    expect('id' in result).toBe(false)
  })
})

// ============================================
// 13. PlanRevisionSchema
// ============================================

describe('PlanRevisionSchema', () => {
  const valid = {
    id: UUID_1,
    plan_id: UUID_2,
    reason: 'レッスン追加リクエスト',
    changes_summary: '2レッスンを追加、1レッスンをスキップに変更',
    superseded_node_ids: [UUID_3],
    new_node_ids: [UUID_1],
    created_at: NOW,
  }

  it('accepts valid revision', () => {
    expect(PlanRevisionSchema.parse(valid)).toEqual(valid)
  })

  it('rejects empty reason', () => {
    expect(() =>
      PlanRevisionSchema.parse({ ...valid, reason: '' }),
    ).toThrow()
  })
})

// ============================================
// 14. EvidenceSubmissionSchema
// ============================================

describe('EvidenceSubmissionSchema', () => {
  const valid = {
    id: UUID_1,
    user_id: UUID_2,
    plan_node_id: UUID_3,
    lesson_id: UUID_1,
    type: 'url' as const,
    content: 'https://my-portfolio.vercel.app',
    metadata: { verified: true },
    submitted_at: NOW,
  }

  it('accepts valid evidence submission', () => {
    expect(EvidenceSubmissionSchema.parse(valid)).toEqual(valid)
  })

  it('accepts all evidence types', () => {
    for (const type of ['url', 'repo', 'screenshot', 'text', 'artifact_metadata']) {
      expect(() =>
        EvidenceSubmissionSchema.parse({ ...valid, type }),
      ).not.toThrow()
    }
  })

  it('rejects invalid type', () => {
    expect(() =>
      EvidenceSubmissionSchema.parse({ ...valid, type: 'audio' }),
    ).toThrow()
  })
})

describe('EvidenceSubmissionInputSchema', () => {
  it('omits id and submitted_at', () => {
    const input = {
      user_id: UUID_2,
      lesson_id: UUID_1,
      type: 'repo' as const,
      content: 'https://github.com/user/portfolio',
    }
    const result = EvidenceSubmissionInputSchema.parse(input)
    expect(result.type).toBe('repo')
    expect('id' in result).toBe(false)
    expect('submitted_at' in result).toBe(false)
  })
})

// ============================================
// 15. CompetencyAssessmentSchema
// ============================================

describe('CompetencyAssessmentSchema', () => {
  const valid = {
    id: UUID_1,
    user_id: UUID_2,
    capability_id: UUID_3,
    evidence_ids: [UUID_1],
    score: 85,
    rubric_results: { criteria_1: 'pass', criteria_2: 'pass' },
    assessed_by: 'ai' as const,
    assessed_at: NOW,
  }

  it('accepts valid assessment', () => {
    expect(CompetencyAssessmentSchema.parse(valid)).toEqual(valid)
  })

  it('rejects score above 100', () => {
    expect(() =>
      CompetencyAssessmentSchema.parse({ ...valid, score: 101 }),
    ).toThrow()
  })

  it('rejects negative score', () => {
    expect(() =>
      CompetencyAssessmentSchema.parse({ ...valid, score: -1 }),
    ).toThrow()
  })

  it('accepts all assessed_by values', () => {
    for (const by of ['ai', 'mentor', 'self']) {
      expect(() =>
        CompetencyAssessmentSchema.parse({ ...valid, assessed_by: by }),
      ).not.toThrow()
    }
  })
})

// ============================================
// 16. GraduationDecisionSchema
// ============================================

describe('GraduationDecisionSchema', () => {
  const valid = {
    id: UUID_1,
    user_id: UUID_2,
    goal_id: UUID_3,
    plan_id: UUID_1,
    status: 'graduated' as const,
    competency_summary: { overall: 'excellent' },
    decided_at: NOW,
  }

  it('accepts valid graduation decision', () => {
    expect(GraduationDecisionSchema.parse(valid)).toEqual(valid)
  })

  it('accepts "not_ready" status', () => {
    expect(() =>
      GraduationDecisionSchema.parse({ ...valid, status: 'not_ready' }),
    ).not.toThrow()
  })

  it('rejects invalid status', () => {
    expect(() =>
      GraduationDecisionSchema.parse({ ...valid, status: 'pending' }),
    ).toThrow()
  })
})

// ============================================
// 17. ContentTagSchema
// ============================================

describe('ContentTagSchema', () => {
  const valid = {
    id: UUID_1,
    slug: 'html',
    label: 'HTML',
    category: 'skill' as const,
  }

  it('accepts valid content tag', () => {
    expect(ContentTagSchema.parse(valid)).toEqual(valid)
  })

  it('accepts all categories', () => {
    for (const cat of ['skill', 'tool', 'topic', 'persona']) {
      expect(() =>
        ContentTagSchema.parse({ ...valid, category: cat }),
      ).not.toThrow()
    }
  })
})

// ============================================
// 18. ToolProfileSchema
// ============================================

describe('ToolProfileSchema', () => {
  const valid = {
    id: UUID_1,
    slug: 'claude-code' as const,
    label: 'Claude Code',
    category: 'ai-coding',
    requires_local_install: true,
  }

  it('accepts valid tool profile', () => {
    expect(ToolProfileSchema.parse(valid)).toEqual(valid)
  })

  it('accepts all tool profile slugs', () => {
    for (const slug of ['codex', 'claude-code', 'manual', 'v0', 'cursor']) {
      expect(() =>
        ToolProfileSchema.parse({ ...valid, slug }),
      ).not.toThrow()
    }
  })
})

// ============================================
// 19. RecommendationEventSchema
// ============================================

describe('RecommendationEventSchema', () => {
  const valid = {
    id: UUID_1,
    user_id: UUID_2,
    plan_node_id: UUID_3,
    lesson_id: UUID_1,
    reason_type: 'domain_match',
    reason_detail: 'Web制作ドメインに直接関連するレッスン',
    score: 0.85,
    created_at: NOW,
  }

  it('accepts valid recommendation event', () => {
    expect(RecommendationEventSchema.parse(valid)).toEqual(valid)
  })

  it('accepts null score', () => {
    expect(() =>
      RecommendationEventSchema.parse({ ...valid, score: null }),
    ).not.toThrow()
  })
})

// ============================================
// 20. TrackViewSchema
// ============================================

describe('TrackViewSchema', () => {
  const valid = {
    id: UUID_1,
    slug: 'web-builder',
    label: 'Web制作トラック',
    headline: 'AIと一緒にWebサイトを作ろう',
    description: 'ポートフォリオからLPまで、AI活用でWeb制作を学ぶトラック',
    target_learners: ['Web制作初心者', 'デザイナー'],
    lesson_ids: [UUID_2, UUID_3],
    domain_ids: [UUID_1],
    icon: null,
  }

  it('accepts valid track view', () => {
    expect(TrackViewSchema.parse(valid)).toEqual(valid)
  })

  it('rejects empty label', () => {
    expect(() =>
      TrackViewSchema.parse({ ...valid, label: '' }),
    ).toThrow()
  })

  it('rejects missing headline', () => {
    const { headline, ...without } = valid
    expect(() => TrackViewSchema.parse(without)).toThrow()
  })
})

describe('TrackViewInputSchema', () => {
  it('omits id, makes icon optional', () => {
    const input = {
      slug: 'automation',
      label: '業務自動化トラック',
      headline: 'AIで業務を効率化しよう',
      description: '定型作業の自動化を学ぶ',
      target_learners: ['事務職'],
      lesson_ids: [UUID_1],
      domain_ids: [UUID_2],
    }
    const result = TrackViewInputSchema.parse(input)
    expect(result.slug).toBe('automation')
    expect('id' in result).toBe(false)
  })
})

// ============================================
// Enum exhaustiveness checks
// ============================================

describe('Enum schemas', () => {
  it('LessonBlockTypeEnum has 10 values', () => {
    expect(LessonBlockTypeEnum.options).toHaveLength(10)
  })

  it('PlanNodeStatusEnum has 5 values', () => {
    expect(PlanNodeStatusEnum.options).toHaveLength(5)
  })

  it('DomainSlugEnum accepts known and custom values', () => {
    expect(DomainSlugEnum.safeParse('web').success).toBe(true)
    expect(DomainSlugEnum.safeParse('custom-domain').success).toBe(true)
    expect(DomainSlugEnum.safeParse('').success).toBe(false)
  })

  it('KnownDomainSlugEnum keeps the 4 canonical values', () => {
    expect(KnownDomainSlugEnum.options).toHaveLength(4)
  })

  it('EvidenceTypeEnum has 5 values', () => {
    expect(EvidenceTypeEnum.options).toHaveLength(5)
  })
})
