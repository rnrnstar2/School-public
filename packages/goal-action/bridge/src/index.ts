export { buildIntakeBundle, deriveLessonFactorySlug } from './intake'
export type { BuildIntakeOptions } from './intake'

export { dryRun } from './dry-run'
export type { DryRunInput } from './dry-run'

export {
  execute,
  ApprovalMissingError,
  UnresolvedStagePlaceholderError,
  createFsIntakeWriter,
} from './runner'
export type {
  BridgeDeps,
  BridgePersist,
  BridgeRunPersistInput,
  ExecuteInput,
  IntakeWriter,
} from './runner'

export {
  stageCommand,
  intakeYamlPath,
  PLACEHOLDER,
} from './stage-commands'
export type {
  StageCommandContext,
  StageCommandSpec,
} from './stage-commands'

export {
  loadApprovalGate,
} from './approval-gate'
export type {
  ApprovalGateFetcher,
  LoadApprovalGateOptions,
} from './approval-gate'

export { createExecPipelineClient } from './pipeline-client'
export type {
  PipelineClient,
  PipelineStagePayload,
} from './pipeline-client'

export {
  BridgeStageSchema,
  BRIDGE_STAGES,
  BridgeEffectSchema,
  LessonDevProposalInputSchema,
  IntakeBundleSchema,
  StagePlanEntrySchema,
  BridgePlanSchema,
  StageResultSchema,
  BridgeResultSchema,
  ApprovalRowSchema,
} from './schema'
export type {
  BridgeStage,
  BridgeEffect,
  LessonDevProposalInput,
  IntakeBundle,
  StagePlanEntry,
  BridgePlan,
  StageResult,
  BridgeResult,
  ApprovalRow,
} from './schema'
