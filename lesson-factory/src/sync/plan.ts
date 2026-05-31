import type { Lesson } from '../core/types.js'

import type {
  AnchorDefinition,
  AnchorSyncPlan,
  AnchorSnapshot,
  AtomSnapshot,
  AtomSyncPlan,
  CapabilityLink,
  PersonaDefinition,
  PersonaSnapshot,
  PersonaSyncPlan,
  PrerequisiteLink,
  RelationDiff,
  SourceDocument,
  SyncCounts,
  SyncPlan,
  SyncSnapshot,
  SyncSources,
} from './types.js'

function compareJsonish(left: unknown, right: unknown): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right))
}

function diffRelations<T>(existing: T[], desired: T[]): RelationDiff<T> {
  const existingMap = new Map(existing.map((item) => [JSON.stringify(item), item]))
  const desiredMap = new Map(desired.map((item) => [JSON.stringify(item), item]))

  const add = Array.from(desiredMap.entries())
    .filter(([key]) => !existingMap.has(key))
    .map(([, value]) => value)
    .sort(compareJsonish)

  const remove = Array.from(existingMap.entries())
    .filter(([key]) => !desiredMap.has(key))
    .map(([, value]) => value)
    .sort(compareJsonish)

  return { add, remove }
}

function buildCapabilities(source: SourceDocument<{ capability_inputs: string[]; capability_outputs: string[] }>): CapabilityLink[] {
  return [
    ...source.value.capability_inputs.map((capability) => ({
      capability,
      direction: 'input' as const,
    })),
    ...source.value.capability_outputs.map((capability) => ({
      capability,
      direction: 'output' as const,
    })),
  ].sort(compareJsonish)
}

function buildPrerequisites(source: SourceDocument<{ hard_prerequisites: string[]; soft_prerequisites: string[] }>): PrerequisiteLink[] {
  return [
    ...source.value.hard_prerequisites.map((prerequisiteAtomId) => ({
      prerequisiteAtomId,
      strength: 'hard' as const,
    })),
    ...source.value.soft_prerequisites.map((prerequisiteAtomId) => ({
      prerequisiteAtomId,
      strength: 'soft' as const,
    })),
  ].sort(compareJsonish)
}

function filterMissingPrerequisiteIds(
  atomId: string,
  prerequisiteAtomIds: string[],
  atomIds: Set<string>,
): { kept: string[]; warnings: string[] } {
  const kept: string[] = []
  const warnings: string[] = []

  for (const prerequisiteAtomId of prerequisiteAtomIds) {
    if (atomIds.has(prerequisiteAtomId)) {
      kept.push(prerequisiteAtomId)
      continue
    }

    warnings.push(`${atomId}: dropped prerequisite ${prerequisiteAtomId} (not in source atoms)`)
  }

  return { kept, warnings }
}

function normalizeAtomPrerequisites(
  source: SourceDocument<Lesson>,
  atomIds: Set<string>,
): { source: SourceDocument<Lesson>; warnings: string[] } {
  const hardPrerequisites = filterMissingPrerequisiteIds(
    source.id,
    source.value.hard_prerequisites,
    atomIds,
  )
  const softPrerequisites = filterMissingPrerequisiteIds(
    source.id,
    source.value.soft_prerequisites,
    atomIds,
  )
  const warnings = [...hardPrerequisites.warnings, ...softPrerequisites.warnings]

  if (warnings.length === 0) {
    return { source, warnings }
  }

  return {
    source: {
      ...source,
      value: {
        ...source.value,
        hard_prerequisites: hardPrerequisites.kept,
        soft_prerequisites: softPrerequisites.kept,
      },
    },
    warnings,
  }
}

function findMatchingVersionId(snapshot: AtomSnapshot | PersonaSnapshot | null, yamlHash: string): string | null {
  if (!snapshot) {
    return null
  }

  const match = snapshot.versions.find((version) => version.yamlHash === yamlHash)
  return match?.versionId ?? null
}

function createAtomPlan(source: SourceDocument<Lesson>, snapshot: AtomSnapshot | null): AtomSyncPlan {
  const desiredCapabilities = buildCapabilities(source)
  const desiredPrerequisites = buildPrerequisites(source)
  const capabilityDiff = diffRelations(snapshot?.capabilities ?? [], desiredCapabilities)
  const prerequisiteDiff = diffRelations(snapshot?.prerequisites ?? [], desiredPrerequisites)
  const relationsChanged = capabilityDiff.add.length > 0
    || capabilityDiff.remove.length > 0
    || prerequisiteDiff.add.length > 0
    || prerequisiteDiff.remove.length > 0
  const currentHashMatches = snapshot?.currentYamlHash === source.yamlHash && snapshot.currentVersionId !== null
  const matchingVersionId = findMatchingVersionId(snapshot, source.yamlHash)
  const sourcePathChanged = snapshot?.sourcePath !== source.relativePath

  if (!snapshot) {
    return {
      entity: 'atom',
      atomId: source.id,
      sourcePath: source.relativePath,
      state: 'create',
      versionAction: 'insert',
      reason: 'new atom file detected',
      yamlHash: source.yamlHash,
      reusedVersionId: null,
      capabilityDiff,
      prerequisiteDiff,
      source,
    }
  }

  if (currentHashMatches) {
    return {
      entity: 'atom',
      atomId: source.id,
      sourcePath: source.relativePath,
      state: relationsChanged || sourcePathChanged ? 'update' : 'noop',
      versionAction: 'none',
      reason: relationsChanged || sourcePathChanged
        ? 'atom metadata changed without YAML version change'
        : 'yaml hash matches current version',
      yamlHash: source.yamlHash,
      reusedVersionId: null,
      capabilityDiff,
      prerequisiteDiff,
      source,
    }
  }

  if (matchingVersionId) {
    return {
      entity: 'atom',
      atomId: source.id,
      sourcePath: source.relativePath,
      state: snapshot.currentVersionId ? 'update' : 'reactivate',
      versionAction: 'reuse',
      reason: 'yaml hash matches an existing version',
      yamlHash: source.yamlHash,
      reusedVersionId: matchingVersionId,
      capabilityDiff,
      prerequisiteDiff,
      source,
    }
  }

  return {
    entity: 'atom',
    atomId: source.id,
    sourcePath: source.relativePath,
    state: snapshot.currentVersionId ? 'update' : 'reactivate',
    versionAction: 'insert',
    reason: 'yaml hash changed from current version',
    yamlHash: source.yamlHash,
    reusedVersionId: null,
    capabilityDiff,
    prerequisiteDiff,
    source,
  }
}

function createDeactivatedAtomPlan(snapshot: AtomSnapshot): AtomSyncPlan {
  return {
    entity: 'atom',
    atomId: snapshot.atomId,
    sourcePath: snapshot.sourcePath,
    state: 'deactivate',
    versionAction: 'clear_current',
    reason: 'atom file missing from source directory',
    yamlHash: null,
    reusedVersionId: null,
    capabilityDiff: {
      add: [],
      remove: snapshot.capabilities.slice().sort(compareJsonish),
    },
    prerequisiteDiff: {
      add: [],
      remove: snapshot.prerequisites.slice().sort(compareJsonish),
    },
    source: null,
  }
}

function createPersonaPlan(source: SourceDocument<PersonaDefinition>, snapshot: PersonaSnapshot | null): PersonaSyncPlan {
  const currentHashMatches = snapshot?.currentYamlHash === source.yamlHash && snapshot.currentVersionId !== null
  const matchingVersionId = findMatchingVersionId(snapshot, source.yamlHash)
  const sourcePathChanged = snapshot?.sourcePath !== source.relativePath

  if (!snapshot) {
    return {
      entity: 'persona',
      personaId: source.id,
      sourcePath: source.relativePath,
      state: 'create',
      versionAction: 'insert',
      reason: 'new persona file detected',
      yamlHash: source.yamlHash,
      reusedVersionId: null,
      source,
    }
  }

  if (currentHashMatches) {
    return {
      entity: 'persona',
      personaId: source.id,
      sourcePath: source.relativePath,
      state: sourcePathChanged ? 'update' : 'noop',
      versionAction: 'none',
      reason: sourcePathChanged
        ? 'persona source path changed without YAML version change'
        : 'yaml hash matches current version',
      yamlHash: source.yamlHash,
      reusedVersionId: null,
      source,
    }
  }

  if (matchingVersionId) {
    return {
      entity: 'persona',
      personaId: source.id,
      sourcePath: source.relativePath,
      state: snapshot.currentVersionId ? 'update' : 'reactivate',
      versionAction: 'reuse',
      reason: 'yaml hash matches an existing version',
      yamlHash: source.yamlHash,
      reusedVersionId: matchingVersionId,
      source,
    }
  }

  return {
    entity: 'persona',
    personaId: source.id,
    sourcePath: source.relativePath,
    state: snapshot.currentVersionId ? 'update' : 'reactivate',
    versionAction: 'insert',
    reason: 'yaml hash changed from current version',
    yamlHash: source.yamlHash,
    reusedVersionId: null,
    source,
  }
}

function createDeactivatedPersonaPlan(snapshot: PersonaSnapshot): PersonaSyncPlan {
  return {
    entity: 'persona',
    personaId: snapshot.personaId,
    sourcePath: snapshot.sourcePath,
    state: 'deactivate',
    versionAction: 'clear_current',
    reason: 'persona file missing from source directory',
    yamlHash: null,
    reusedVersionId: null,
    source: null,
  }
}

function createAnchorPlan(source: SourceDocument<AnchorDefinition>, snapshot: AnchorSnapshot | null): AnchorSyncPlan {
  if (!snapshot) {
    return {
      entity: 'anchor',
      anchorId: source.id,
      sourcePath: source.relativePath,
      state: 'create',
      reason: 'new anchor file detected',
      yamlHash: source.yamlHash,
      source,
    }
  }

  if (snapshot.yamlHash === source.yamlHash) {
    return {
      entity: 'anchor',
      anchorId: source.id,
      sourcePath: source.relativePath,
      state: 'noop',
      reason: 'yaml hash matches current row',
      yamlHash: source.yamlHash,
      source,
    }
  }

  return {
    entity: 'anchor',
    anchorId: source.id,
    sourcePath: source.relativePath,
    state: 'update',
    reason: 'yaml hash changed from current row',
    yamlHash: source.yamlHash,
    source,
  }
}

function buildCounts({
  atoms,
  personas,
  anchors,
}: {
  atoms: AtomSyncPlan[]
  personas: PersonaSyncPlan[]
  anchors: AnchorSyncPlan[]
}): SyncCounts {
  const atomChanges = atoms.filter((plan) => plan.state !== 'noop').length
  const personaChanges = personas.filter((plan) => plan.state !== 'noop').length
  const anchorChanges = anchors.filter((plan) => plan.state !== 'noop').length

  return {
    atomChanges,
    personaChanges,
    anchorChanges,
    totalChanges: atomChanges + personaChanges + anchorChanges,
  }
}

export function buildSyncPlan({
  sources,
  snapshot,
  dryRun,
  generatedAt,
}: {
  sources: SyncSources
  snapshot: SyncSnapshot
  dryRun: boolean
  generatedAt: string
}): SyncPlan {
  const warnings: string[] = []
  const atomIds = new Set(sources.atoms.map((source) => source.id))
  const atoms = sources.atoms.map((source) => {
    const normalized = normalizeAtomPrerequisites(source, atomIds)
    warnings.push(...normalized.warnings)
    return createAtomPlan(normalized.source, snapshot.atoms.get(source.id) ?? null)
  })
  const personas = sources.personas.map((source) => createPersonaPlan(source, snapshot.personas.get(source.id) ?? null))
  const anchors = sources.anchors.map((source) => createAnchorPlan(source, snapshot.anchors.get(source.id) ?? null))

  for (const [atomId, atomSnapshot] of snapshot.atoms.entries()) {
    if (sources.atoms.some((source) => source.id === atomId)) {
      continue
    }

    warnings.push(`Atom file deleted or missing: ${atomSnapshot.sourcePath} (${atomId})`)
    atoms.push(createDeactivatedAtomPlan(atomSnapshot))
  }

  for (const [personaId, personaSnapshot] of snapshot.personas.entries()) {
    if (sources.personas.some((source) => source.id === personaId)) {
      continue
    }

    warnings.push(`Persona file deleted or missing: ${personaSnapshot.sourcePath} (${personaId})`)
    personas.push(createDeactivatedPersonaPlan(personaSnapshot))
  }

  if (!sources.anchorsDirectoryExists) {
    warnings.push('Anchor directory missing: lesson-factory/lessons/anchors (sync skipped)')
  } else {
    for (const [anchorId] of snapshot.anchors.entries()) {
      if (sources.anchors.some((source) => source.id === anchorId)) {
        continue
      }

      warnings.push(`Anchor file deleted or missing; keeping DB row intact: ${anchorId}`)
    }
  }

  atoms.sort((left, right) => left.atomId.localeCompare(right.atomId))
  personas.sort((left, right) => left.personaId.localeCompare(right.personaId))
  anchors.sort((left, right) => left.anchorId.localeCompare(right.anchorId))

  return {
    generatedAt,
    dryRun,
    warnings,
    atoms,
    personas,
    anchors,
    counts: buildCounts({ atoms, personas, anchors }),
  }
}
