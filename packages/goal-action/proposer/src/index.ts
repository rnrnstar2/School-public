export { dedup } from './dedup'
export { generateProposals, type GenerateProposalsInput } from './generate'
export {
  persistProposals,
  type LessonDevProposalPersistClient,
  type LessonDevProposalPersistInsert,
  type LessonDevProposalPersistRow,
  type PersistProposalsResult,
} from './persist'
export { determinePriority, highestPriority } from './priority'
export {
  CurriculumArchitectureSchema,
  GenerateProposalsOptionsSchema,
  LessonDevProposalSchema,
  ProposalEvidenceSchema,
  ProposalPrioritySchema,
  ProposalStatusSchema,
  WeakestAxisSchema,
  type CurriculumArchitecture,
  type GenerateProposalsOptions,
  type LessonDevProposal,
  type ProposalEvidence,
  type ProposalPriority,
  type ProposalStatus,
  type WeakestAxis,
} from './schema'
