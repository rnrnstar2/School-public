import type { Lesson } from '../core/types.js'

export interface PersonaDefinition {
  id: string
  name: string
  background: string
  goals: string[]
  constraints: string[]
  preferred_tools: string[]
  learning_pace: string
}

export interface AnchorDefinition {
  id: string
  persona_id: string
  ordered_atom_ids: string[]
  required_capabilities: string[]
  description: string
}

export type SourceKind = 'atom' | 'persona' | 'anchor'

export interface SourceDocument<T> {
  kind: SourceKind
  id: string
  absolutePath: string
  relativePath: string
  rawYaml: string
  yamlHash: string
  value: T
}

export interface CapabilityLink {
  capability: string
  direction: 'input' | 'output'
}

export interface PrerequisiteLink {
  prerequisiteAtomId: string
  strength: 'hard' | 'soft'
}

export interface VersionSnapshot {
  versionId: string
  yamlHash: string | null
  importedAt: string | null
  status?: string | null
}

export interface AtomSnapshot {
  atomId: string
  sourcePath: string
  currentVersionId: string | null
  currentYamlHash: string | null
  versions: VersionSnapshot[]
  capabilities: CapabilityLink[]
  prerequisites: PrerequisiteLink[]
}

export interface PersonaSnapshot {
  personaId: string
  sourcePath: string
  currentVersionId: string | null
  currentYamlHash: string | null
  versions: VersionSnapshot[]
}

export interface AnchorSnapshot {
  anchorId: string
  yamlHash: string | null
}

export interface SyncSnapshot {
  atoms: Map<string, AtomSnapshot>
  personas: Map<string, PersonaSnapshot>
  anchors: Map<string, AnchorSnapshot>
}

export interface RelationDiff<T> {
  add: T[]
  remove: T[]
}

export type SyncState =
  | 'create'
  | 'update'
  | 'reactivate'
  | 'deactivate'
  | 'noop'

export type VersionAction = 'insert' | 'reuse' | 'none' | 'clear_current'

export interface AtomSyncPlan {
  entity: 'atom'
  atomId: string
  sourcePath: string
  state: SyncState
  versionAction: VersionAction
  reason: string
  yamlHash: string | null
  reusedVersionId: string | null
  capabilityDiff: RelationDiff<CapabilityLink>
  prerequisiteDiff: RelationDiff<PrerequisiteLink>
  source: SourceDocument<Lesson> | null
}

export interface PersonaSyncPlan {
  entity: 'persona'
  personaId: string
  sourcePath: string
  state: SyncState
  versionAction: VersionAction
  reason: string
  yamlHash: string | null
  reusedVersionId: string | null
  source: SourceDocument<PersonaDefinition> | null
}

export interface AnchorSyncPlan {
  entity: 'anchor'
  anchorId: string
  sourcePath: string
  state: Exclude<SyncState, 'reactivate' | 'deactivate'>
  reason: string
  yamlHash: string | null
  source: SourceDocument<AnchorDefinition> | null
}

export interface SyncSources {
  atoms: SourceDocument<Lesson>[]
  personas: SourceDocument<PersonaDefinition>[]
  anchors: SourceDocument<AnchorDefinition>[]
  anchorsDirectoryExists: boolean
}

export interface SyncCounts {
  atomChanges: number
  personaChanges: number
  anchorChanges: number
  totalChanges: number
}

export interface SyncPlan {
  generatedAt: string
  dryRun: boolean
  warnings: string[]
  atoms: AtomSyncPlan[]
  personas: PersonaSyncPlan[]
  anchors: AnchorSyncPlan[]
  counts: SyncCounts
}

export interface SyncResult {
  plan: SyncPlan
  logPath: string
}

export interface SyncRepository {
  loadSnapshot(): Promise<SyncSnapshot>
  applyPlan(plan: SyncPlan): Promise<void>
}
