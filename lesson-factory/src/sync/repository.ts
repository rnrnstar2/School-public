import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import type { PostgrestError } from '@supabase/supabase-js'

import type { Lesson } from '../core/types.js'

import type {
  AnchorDefinition,
  AnchorSnapshot,
  AtomSnapshot,
  CapabilityLink,
  PersonaDefinition,
  PersonaSnapshot,
  PrerequisiteLink,
  SyncPlan,
  SyncRepository,
  SyncSnapshot,
  VersionSnapshot,
} from './types.js'

const require = createRequire(import.meta.url)
const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const supabaseJsPath = path.resolve(
  moduleDir,
  '../../../apps/web/node_modules/@supabase/supabase-js',
)
const { createClient } = require(supabaseJsPath) as {
  createClient: (url: string, key: string, options?: Record<string, unknown>) => any
}

type SupabaseClientLike = ReturnType<typeof createClient>

function assertClientEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required for lesson sync`)
  }

  return value
}

function createServiceClient(): SupabaseClientLike {
  const url = assertClientEnv('SUPABASE_URL', process.env.SUPABASE_URL)
  const key = assertClientEnv(
    'SUPABASE_SERVICE_ROLE_KEY',
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function mapVersions(rows: Array<{
  version_id: string
  yaml_hash: string | null
  imported_at: string | null
  status?: string | null
}>): VersionSnapshot[] {
  return rows.map((row) => ({
    versionId: row.version_id,
    yamlHash: row.yaml_hash,
    importedAt: row.imported_at,
    status: row.status ?? null,
  }))
}

function currentHashFromVersions(currentVersionId: string | null, versions: VersionSnapshot[]): string | null {
  if (!currentVersionId) {
    return null
  }

  return versions.find((version) => version.versionId === currentVersionId)?.yamlHash ?? null
}

function groupByKey<T extends Record<string, unknown>>(rows: T[], key: keyof T): Map<string, T[]> {
  const grouped = new Map<string, T[]>()

  for (const row of rows) {
    const groupKey = row[key]
    if (typeof groupKey !== 'string') {
      continue
    }

    const current = grouped.get(groupKey) ?? []
    current.push(row)
    grouped.set(groupKey, current)
  }

  return grouped
}

function assertNoError(error: { message: string } | null, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`)
  }
}

export async function selectIn<TRow>(
  client: SupabaseClientLike,
  table: string,
  selectClause: string,
  filterColumn: string,
  ids: string[],
  batchSize = 100,
): Promise<{ data: TRow[]; error: PostgrestError | null }> {
  if (ids.length === 0) {
    return { data: [], error: null }
  }

  const result: TRow[] = []
  for (let index = 0; index < ids.length; index += batchSize) {
    const batch = ids.slice(index, index + batchSize)
    const { data, error } = await client
      .from(table)
      .select(selectClause)
      .in(filterColumn, batch)

    if (error) {
      return { data: [], error }
    }

    result.push(...((data ?? []) as TRow[]))
  }

  return { data: result, error: null }
}

async function replaceCapabilities(
  client: SupabaseClientLike,
  atomId: string,
  desired: CapabilityLink[],
): Promise<void> {
  const { error: deleteError } = await client
    .from('lesson_atom_capabilities')
    .delete()
    .eq('atom_id', atomId)

  assertNoError(deleteError, `Failed to clear capabilities for ${atomId}`)

  if (desired.length === 0) {
    return
  }

  const { error: insertError } = await client
    .from('lesson_atom_capabilities')
    .upsert(
      desired.map((item) => ({
        atom_id: atomId,
        capability: item.capability,
        direction: item.direction,
      })),
      { onConflict: 'atom_id,capability,direction' },
    )

  assertNoError(insertError, `Failed to upsert capabilities for ${atomId}`)
}

async function replacePrerequisites(
  client: SupabaseClientLike,
  atomId: string,
  desired: PrerequisiteLink[],
): Promise<void> {
  const { error: deleteError } = await client
    .from('lesson_atom_prerequisites')
    .delete()
    .eq('atom_id', atomId)

  assertNoError(deleteError, `Failed to clear prerequisites for ${atomId}`)

  if (desired.length === 0) {
    return
  }

  const { error: insertError } = await client
    .from('lesson_atom_prerequisites')
    .upsert(
      desired.map((item) => ({
        atom_id: atomId,
        prerequisite_atom_id: item.prerequisiteAtomId,
        strength: item.strength,
      })),
      { onConflict: 'atom_id,prerequisite_atom_id,strength' },
    )

  assertNoError(insertError, `Failed to upsert prerequisites for ${atomId}`)
}

async function readBodyMarkdownForAtom(sourcePath: string): Promise<string | null> {
  // Convention: <atom>.yaml + sibling <atom>.body.md
  const bodyRelative = sourcePath.replace(/\.ya?ml$/i, '.body.md')
  if (bodyRelative === sourcePath) return null
  // sourcePath is repo-root relative (see toRepoRelativePath in core/paths.ts),
  // so resolve against the repo root rather than process.cwd().
  const { getRepoRoot } = await import('../core/paths.js')
  const pathModule = await import('node:path')
  const absoluteBodyPath = pathModule.isAbsolute(bodyRelative)
    ? bodyRelative
    : pathModule.join(getRepoRoot(), bodyRelative)
  try {
    const { readFile } = await import('node:fs/promises')
    return await readFile(absoluteBodyPath, 'utf8')
  } catch {
    return null
  }
}

async function upsertAtomVersion(
  client: SupabaseClientLike,
  atomId: string,
  sourcePath: string,
  lesson: Lesson,
  yamlHash: string,
): Promise<string> {
  const bodyMarkdown = await readBodyMarkdownForAtom(sourcePath)
  const { data, error } = await client
    .from('lesson_atom_versions')
    .insert({
      atom_id: atomId,
      status: lesson.status,
      yaml_hash: yamlHash,
      yaml_content: lesson,
      body_markdown: bodyMarkdown,
      metadata: {
        title: lesson.title,
        source_path: sourcePath,
        persona_tags: lesson.persona_tags,
        goal_tags: lesson.goal_tags,
        deliverable: lesson.deliverable,
        evidence: lesson.evidence,
        media_slots: lesson.media_slots,
        freshness_sources: lesson.freshness_sources,
      },
      imported_by: 'lesson-factory-sync',
    })
    .select('version_id')
    .single()

  assertNoError(error, `Failed to insert lesson atom version for ${atomId}`)
  return data.version_id as string
}

async function upsertPersonaVersion(
  client: SupabaseClientLike,
  personaId: string,
  persona: PersonaDefinition,
  yamlHash: string,
): Promise<string> {
  const { data, error } = await client
    .from('persona_versions')
    .insert({
      persona_id: personaId,
      yaml_hash: yamlHash,
      yaml_content: persona,
    })
    .select('version_id')
    .single()

  assertNoError(error, `Failed to insert persona version for ${personaId}`)
  return data.version_id as string
}

async function upsertAnchorRow(
  client: SupabaseClientLike,
  anchor: AnchorDefinition,
  yamlHash: string,
): Promise<void> {
  const { error } = await client
    .from('lesson_anchors')
    .upsert(
      {
        anchor_id: anchor.id,
        persona_id: anchor.persona_id,
        ordered_atom_ids: anchor.ordered_atom_ids,
        required_capabilities: anchor.required_capabilities,
        description: anchor.description,
        yaml_hash: yamlHash,
      },
      { onConflict: 'anchor_id' },
    )

  assertNoError(error, `Failed to upsert anchor ${anchor.id}`)
}

export class SupabaseSyncRepository implements SyncRepository {
  constructor(private readonly client: SupabaseClientLike = createServiceClient()) {}

  async loadSnapshot(): Promise<SyncSnapshot> {
    const [atomsResult, personasResult, anchorsResult] = await Promise.all([
      this.client
        .from('lesson_atoms')
        .select('atom_id, source_path, current_version_id'),
      this.client
        .from('personas')
        .select('persona_id, source_path, current_version_id'),
      this.client
        .from('lesson_anchors')
        .select('anchor_id, yaml_hash'),
    ])

    assertNoError(atomsResult.error, 'Failed to load lesson_atoms')
    assertNoError(personasResult.error, 'Failed to load personas')
    assertNoError(anchorsResult.error, 'Failed to load lesson_anchors')

    const atomRows = (atomsResult.data ?? []) as Array<{
      atom_id: string
      source_path: string
      current_version_id: string | null
    }>
    const personaRows = (personasResult.data ?? []) as Array<{
      persona_id: string
      source_path: string
      current_version_id: string | null
    }>
    const atomIds = atomRows.map((row) => row.atom_id)
    const personaIds = personaRows.map((row) => row.persona_id)

    const [atomVersionsResult, capabilityRowsResult, prerequisiteRowsResult, personaVersionsResult] =
      await Promise.all([
        selectIn<{
          version_id: string
          atom_id: string
          yaml_hash: string | null
          imported_at: string | null
          status: string | null
        }>(
          this.client,
          'lesson_atom_versions',
          'version_id, atom_id, yaml_hash, imported_at, status',
          'atom_id',
          atomIds,
        ),
        selectIn<{
          atom_id: string
          capability: string
          direction: 'input' | 'output'
        }>(
          this.client,
          'lesson_atom_capabilities',
          'atom_id, capability, direction',
          'atom_id',
          atomIds,
        ),
        selectIn<{
          atom_id: string
          prerequisite_atom_id: string
          strength: 'hard' | 'soft'
        }>(
          this.client,
          'lesson_atom_prerequisites',
          'atom_id, prerequisite_atom_id, strength',
          'atom_id',
          atomIds,
        ),
        selectIn<{
          version_id: string
          persona_id: string
          yaml_hash: string | null
          imported_at: string | null
        }>(
          this.client,
          'persona_versions',
          'version_id, persona_id, yaml_hash, imported_at',
          'persona_id',
          personaIds,
        ),
      ])

    assertNoError(atomVersionsResult.error, 'Failed to load lesson_atom_versions')
    assertNoError(capabilityRowsResult.error, 'Failed to load lesson_atom_capabilities')
    assertNoError(prerequisiteRowsResult.error, 'Failed to load lesson_atom_prerequisites')
    assertNoError(personaVersionsResult.error, 'Failed to load persona_versions')

    const atomVersionsByAtomId = groupByKey(
      atomVersionsResult.data,
      'atom_id',
    )
    const capabilitiesByAtomId = groupByKey(
      capabilityRowsResult.data,
      'atom_id',
    )
    const prerequisitesByAtomId = groupByKey(
      prerequisiteRowsResult.data,
      'atom_id',
    )
    const personaVersionsByPersonaId = groupByKey(
      personaVersionsResult.data,
      'persona_id',
    )

    const atoms = new Map<string, AtomSnapshot>()
    for (const row of atomRows) {
      const versions = mapVersions(atomVersionsByAtomId.get(row.atom_id) ?? [])
      atoms.set(row.atom_id, {
        atomId: row.atom_id,
        sourcePath: row.source_path,
        currentVersionId: row.current_version_id,
        currentYamlHash: currentHashFromVersions(row.current_version_id, versions),
        versions,
        capabilities: ((capabilitiesByAtomId.get(row.atom_id) ?? []) as Array<{
          capability: string
          direction: 'input' | 'output'
        }>).map((item) => ({
          capability: item.capability,
          direction: item.direction,
        })),
        prerequisites: ((prerequisitesByAtomId.get(row.atom_id) ?? []) as Array<{
          prerequisite_atom_id: string
          strength: 'hard' | 'soft'
        }>).map((item) => ({
          prerequisiteAtomId: item.prerequisite_atom_id,
          strength: item.strength,
        })),
      })
    }

    const personas = new Map<string, PersonaSnapshot>()
    for (const row of personaRows) {
      const versions = mapVersions(personaVersionsByPersonaId.get(row.persona_id) ?? [])
      personas.set(row.persona_id, {
        personaId: row.persona_id,
        sourcePath: row.source_path,
        currentVersionId: row.current_version_id,
        currentYamlHash: currentHashFromVersions(row.current_version_id, versions),
        versions,
      })
    }

    const anchors = new Map<string, AnchorSnapshot>()
    for (const row of (anchorsResult.data ?? []) as Array<{
      anchor_id: string
      yaml_hash: string | null
    }>) {
      anchors.set(row.anchor_id, {
        anchorId: row.anchor_id,
        yamlHash: row.yaml_hash,
      })
    }

    return { atoms, personas, anchors }
  }

  async applyPlan(plan: SyncPlan): Promise<void> {
    for (const atomPlan of plan.atoms) {
      if (atomPlan.state === 'noop') {
        continue
      }

      if (atomPlan.state === 'deactivate') {
        const { error } = await this.client
          .from('lesson_atoms')
          .update({
            current_version_id: null,
            updated_at: plan.generatedAt,
          })
          .eq('atom_id', atomPlan.atomId)

        assertNoError(error, `Failed to deactivate atom ${atomPlan.atomId}`)
        await replaceCapabilities(this.client, atomPlan.atomId, [])
        await replacePrerequisites(this.client, atomPlan.atomId, [])
        continue
      }

      if (!atomPlan.source || !atomPlan.yamlHash) {
        throw new Error(`Atom plan missing source payload for ${atomPlan.atomId}`)
      }

      const { error: atomUpsertError } = await this.client
        .from('lesson_atoms')
        .upsert(
          {
            atom_id: atomPlan.atomId,
            source_path: atomPlan.sourcePath,
            updated_at: plan.generatedAt,
          },
          { onConflict: 'atom_id' },
        )

      assertNoError(atomUpsertError, `Failed to upsert lesson atom ${atomPlan.atomId}`)

      let currentVersionId = atomPlan.reusedVersionId

      if (atomPlan.versionAction === 'insert') {
        currentVersionId = await upsertAtomVersion(
          this.client,
          atomPlan.atomId,
          atomPlan.sourcePath,
          atomPlan.source.value,
          atomPlan.yamlHash,
        )
      }

      if (atomPlan.versionAction === 'insert' || atomPlan.versionAction === 'reuse') {
        const { error: currentVersionError } = await this.client
          .from('lesson_atoms')
          .update({
            current_version_id: currentVersionId,
            source_path: atomPlan.sourcePath,
            updated_at: plan.generatedAt,
          })
          .eq('atom_id', atomPlan.atomId)

        assertNoError(currentVersionError, `Failed to set current version for ${atomPlan.atomId}`)
      }

      const desiredCapabilities = [
        ...atomPlan.source.value.capability_inputs.map((capability) => ({
          capability,
          direction: 'input' as const,
        })),
        ...atomPlan.source.value.capability_outputs.map((capability) => ({
          capability,
          direction: 'output' as const,
        })),
      ]
      const desiredPrerequisites = [
        ...atomPlan.source.value.hard_prerequisites.map((prerequisiteAtomId) => ({
          prerequisiteAtomId,
          strength: 'hard' as const,
        })),
        ...atomPlan.source.value.soft_prerequisites.map((prerequisiteAtomId) => ({
          prerequisiteAtomId,
          strength: 'soft' as const,
        })),
      ]

      await replaceCapabilities(
        this.client,
        atomPlan.atomId,
        dedupeCapabilities(desiredCapabilities),
      )
      await replacePrerequisites(
        this.client,
        atomPlan.atomId,
        dedupePrerequisites(desiredPrerequisites),
      )
    }

    for (const personaPlan of plan.personas) {
      if (personaPlan.state === 'noop') {
        continue
      }

      if (personaPlan.state === 'deactivate') {
        const { error } = await this.client
          .from('personas')
          .update({
            current_version_id: null,
            updated_at: plan.generatedAt,
          })
          .eq('persona_id', personaPlan.personaId)

        assertNoError(error, `Failed to deactivate persona ${personaPlan.personaId}`)
        continue
      }

      if (!personaPlan.source || !personaPlan.yamlHash) {
        throw new Error(`Persona plan missing source payload for ${personaPlan.personaId}`)
      }

      const { error: personaUpsertError } = await this.client
        .from('personas')
        .upsert(
          {
            persona_id: personaPlan.personaId,
            source_path: personaPlan.sourcePath,
            updated_at: plan.generatedAt,
          },
          { onConflict: 'persona_id' },
        )

      assertNoError(personaUpsertError, `Failed to upsert persona ${personaPlan.personaId}`)

      let currentVersionId = personaPlan.reusedVersionId

      if (personaPlan.versionAction === 'insert') {
        currentVersionId = await upsertPersonaVersion(
          this.client,
          personaPlan.personaId,
          personaPlan.source.value,
          personaPlan.yamlHash,
        )
      }

      if (personaPlan.versionAction === 'insert' || personaPlan.versionAction === 'reuse') {
        const { error: currentVersionError } = await this.client
          .from('personas')
          .update({
            current_version_id: currentVersionId,
            source_path: personaPlan.sourcePath,
            updated_at: plan.generatedAt,
          })
          .eq('persona_id', personaPlan.personaId)

        assertNoError(currentVersionError, `Failed to set current version for ${personaPlan.personaId}`)
      }
    }

    for (const anchorPlan of plan.anchors) {
      if (anchorPlan.state === 'noop') {
        continue
      }

      if (!anchorPlan.source || !anchorPlan.yamlHash) {
        throw new Error(`Anchor plan missing source payload for ${anchorPlan.anchorId}`)
      }

      await upsertAnchorRow(this.client, anchorPlan.source.value, anchorPlan.yamlHash)
    }
  }
}

function dedupeCapabilities(items: CapabilityLink[]): CapabilityLink[] {
  return Array.from(
    new Map(
      items.map((item) => [`${item.direction}:${item.capability}`, item]),
    ).values(),
  ).sort((left, right) => `${left.direction}:${left.capability}`.localeCompare(`${right.direction}:${right.capability}`))
}

function dedupePrerequisites(items: PrerequisiteLink[]): PrerequisiteLink[] {
  return Array.from(
    new Map(
      items.map((item) => [`${item.strength}:${item.prerequisiteAtomId}`, item]),
    ).values(),
  ).sort((left, right) => `${left.strength}:${left.prerequisiteAtomId}`.localeCompare(`${right.strength}:${right.prerequisiteAtomId}`))
}

export function createSupabaseSyncRepository(): SyncRepository {
  return new SupabaseSyncRepository()
}
