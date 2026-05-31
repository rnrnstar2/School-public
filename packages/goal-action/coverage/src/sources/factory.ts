import { promises as fs } from 'node:fs'
import path from 'node:path'

import yaml from 'js-yaml'

import type { AtomNode, LessonNode, LessonStatus } from '../schema'

/**
 * Factory source locator.
 *
 * Points at `lesson-factory/lessons/atoms/` style directories (owner-local
 * canonical atoms). Each `atom.<persona>.<slug>.yaml` file is treated as
 * both a `LessonNode` (for the lesson graph) AND an `AtomNode` (for
 * provenance) because the lesson-factory model uses atoms as the unit of
 * lesson delivery.
 */
export type FactorySource = { dir: string }

export type FactoryLoadResult = {
  lessons: LessonNode[]
  atoms: AtomNode[]
  warnings: Array<{
    code: 'unreadable_source'
    message: string
    source_path: string | null
    lesson_id: string | null
  }>
}

type RawAtomYaml = {
  id?: unknown
  title?: unknown
  summary?: unknown
  persona_tags?: unknown
  goal_tags?: unknown
  capability_inputs?: unknown
  capability_outputs?: unknown
  hard_prerequisites?: unknown
  soft_prerequisites?: unknown
  status?: unknown
}

export async function loadFactorySources(
  sources: FactorySource[],
): Promise<FactoryLoadResult> {
  const lessons: LessonNode[] = []
  const atoms: AtomNode[] = []
  const warnings: FactoryLoadResult['warnings'] = []

  for (const source of sources) {
    let entries: string[]
    try {
      entries = await fs.readdir(source.dir)
    } catch (error) {
      warnings.push({
        code: 'unreadable_source',
        message: `factory directory ${source.dir} is not readable: ${toMessage(error)}`,
        source_path: source.dir,
        lesson_id: null,
      })
      continue
    }

    // Only the "atom.*.yaml" files carry canonical lesson metadata.
    // Sibling `.body.md` files are skipped here (consumed downstream).
    const yamlFiles = entries
      .filter((e) => e.endsWith('.yaml') || e.endsWith('.yml'))
      .sort()

    for (const file of yamlFiles) {
      const full = path.join(source.dir, file)
      // For hashing determinism we record the *relative* filename only
      // (e.g. `atom.web-builder.create-homepage.yaml`) instead of the
      // absolute `full` path, which would leak `process.cwd()` into
      // content_hash and break cross-environment snapshot comparison.
      const relPath = file
      try {
        const raw = await fs.readFile(full, 'utf8')
        const parsed = yaml.load(raw) as RawAtomYaml | null
        if (!parsed || typeof parsed !== 'object') continue
        const node = toLessonNode(parsed, relPath)
        const atom = toAtomNode(parsed, relPath)
        if (node) lessons.push(node)
        if (atom) atoms.push(atom)
      } catch (error) {
        warnings.push({
          code: 'unreadable_source',
          message: `factory atom yaml ${relPath} failed to parse: ${toMessage(error)}`,
          source_path: relPath,
          lesson_id: null,
        })
      }
    }
  }

  return { lessons, atoms, warnings }
}

function toLessonNode(raw: RawAtomYaml, sourcePath: string): LessonNode | null {
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null
  return {
    id: raw.id,
    title: raw.title,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    track_id: null,
    module_id: null,
    milestone_id: null,
    status: toStatus(raw.status),
    capability_inputs: asStringArray(raw.capability_inputs),
    capability_outputs: asStringArray(raw.capability_outputs),
    hard_prerequisites: asStringArray(raw.hard_prerequisites),
    soft_prerequisites: asStringArray(raw.soft_prerequisites),
    persona_tags: asStringArray(raw.persona_tags),
    goal_tags: asStringArray(raw.goal_tags),
    source_kind: 'factory',
    source_path: sourcePath,
    updated_at: 'deterministic',
  }
}

function toAtomNode(raw: RawAtomYaml, sourcePath: string): AtomNode | null {
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null
  return {
    id: raw.id,
    title: raw.title,
    persona_tags: asStringArray(raw.persona_tags),
    goal_tags: asStringArray(raw.goal_tags),
    capability_inputs: asStringArray(raw.capability_inputs),
    capability_outputs: asStringArray(raw.capability_outputs),
    status: toStatus(raw.status),
    source_path: sourcePath,
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const filtered = value.filter((v): v is string => typeof v === 'string')
  return Array.from(new Set(filtered)).sort()
}

function toStatus(value: unknown): LessonStatus {
  if (typeof value !== 'string') return 'draft'
  switch (value) {
    case 'draft':
    case 'published':
    case 'reviewed':
    case 'experimental':
    case 'stable':
    case 'deprecated':
      return value
    default:
      return 'draft'
  }
}

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
