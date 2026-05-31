import { z } from 'zod/v4'

export const ACTION_CAPABILITIES = [
  'research',
  'plan',
  'setup',
  'build',
  'integrate',
  'automate',
  'test',
  'ship',
  'measure',
] as const

export const ACTION_OUTCOMES = [
  'clarify_scope',
  'prepare_foundation',
  'create_asset',
  'connect_systems',
  'automate_process',
  'publish_release',
  'validate_quality',
  'grow_audience',
  'measure_performance',
] as const

export const ACTION_BLOCKERS = [
  'none',
  'clarity',
  'skill_gap',
  'environment',
  'integration',
  'content_supply',
  'time',
  'approval',
  'quality',
] as const

export const ACTION_STACKS = [
  'JavaScript',
  'LangChain',
  'Next.js',
  'Node.js',
  'OpenAI',
  'PostgreSQL',
  'Python',
  'React',
  'Shopify',
  'Supabase',
  'Tailwind CSS',
  'TypeScript',
  'Vercel',
  'YouTube',
] as const

export const ActionCapabilitySchema = z.enum(ACTION_CAPABILITIES)
export const ActionOutcomeSchema = z.enum(ACTION_OUTCOMES)
export const ActionBlockerSchema = z.enum(ACTION_BLOCKERS)
export const ActionStackSchema = z.enum(ACTION_STACKS)
export const NormalizeStrategySchema = z.literal('dictionary')

export const RawActionObjectSchema = z.object({
  id: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  outcome: z.string().min(1).optional(),
  purpose: z.string().min(1).optional(),
  blockers: z.array(z.string().min(1)).optional(),
  stack: z.array(z.string().min(1)).optional(),
}).passthrough().refine(
  (value) => Boolean(value.text || value.title || value.description || value.outcome || value.purpose),
  {
    message: 'raw action object must include at least one text field',
  },
)

export const RawActionSchema = z.union([
  z.string().min(1),
  RawActionObjectSchema,
])

export const CanonicalActionSchema = z.object({
  actionId: z.string().min(1),
  rawAction: z.string().min(1),
  capability: ActionCapabilitySchema,
  outcome: ActionOutcomeSchema,
  blocker: ActionBlockerSchema,
  context: z.object({
    stack: z.array(ActionStackSchema),
  }),
})

export const NormalizeActionsInputSchema = z.object({
  goal: z.string().min(1),
  rawActions: z.array(RawActionSchema),
  strategy: NormalizeStrategySchema.optional(),
})

export type ActionCapability = z.infer<typeof ActionCapabilitySchema>
export type ActionOutcome = z.infer<typeof ActionOutcomeSchema>
export type ActionBlocker = z.infer<typeof ActionBlockerSchema>
export type ActionStack = z.infer<typeof ActionStackSchema>
export type NormalizeStrategy = z.infer<typeof NormalizeStrategySchema>
export type RawActionObject = z.infer<typeof RawActionObjectSchema>
export type RawAction = z.infer<typeof RawActionSchema>
export type CanonicalAction = z.infer<typeof CanonicalActionSchema>
export type NormalizeActionsInput = z.infer<typeof NormalizeActionsInputSchema>
