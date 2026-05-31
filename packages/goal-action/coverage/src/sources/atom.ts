import { promises as fs } from 'node:fs'
import path from 'node:path'

import yaml from 'js-yaml'

import type { AtomNode, LessonStatus } from '../schema'

/**
 * Atom source locator.
 *
 * Historically School had an `apps/web/src/data/atoms/` directory. It
 * does not exist in every worktree, and the canonical atoms now live
 * under `lesson-factory/lessons/atoms/` (see `factory.ts`).
 *
 * This loader handles a legacy `apps/web/src/data/atoms/` style dir
 * for forward compatibility. If the directory is absent we return an
 * empty list and surface a single warning so callers can choose to
 * ignore it.
 */
export type AtomSource = { dir: string }

type AtomLoadWarning = {
  code: 'unreadable_source'
  message: string
  source_path: string | null
  lesson_id: string | null
}

export type AtomLoadResult = {
  atoms: AtomNode[]
  warnings: AtomLoadWarning[]
}

type RawAtom = {
  id?: unknown
  title?: unknown
  persona_tags?: unknown
  goal_tags?: unknown
  capability_inputs?: unknown
  capability_outputs?: unknown
  status?: unknown
}

export async function loadAtomSources(
  sources: AtomSource[],
): Promise<AtomLoadResult> {
  const atoms: AtomNode[] = []
  const warnings: AtomLoadWarning[] = []

  for (const source of sources) {
    let entries: string[]
    try {
      entries = await fs.readdir(source.dir)
    } catch (error) {
      warnings.push({
        code: 'unreadable_source',
        message: `atom directory ${source.dir} is not readable: ${toMessage(error)}`,
        source_path: source.dir,
        lesson_id: null,
      })
      continue
    }

    const yamlFiles = entries
      .filter((e) => e.endsWith('.yaml') || e.endsWith('.yml'))
      .sort()

    for (const file of yamlFiles) {
      const full = path.join(source.dir, file)
      try {
        const raw = await fs.readFile(full, 'utf8')
        const parsed = yaml.load(raw) as RawAtom | null
        if (!parsed || typeof parsed !== 'object') continue
        const node = toAtomNode(parsed, full)
        if (node) atoms.push(node)
      } catch (error) {
        warnings.push({
          code: 'unreadable_source',
          message: `atom yaml ${full} failed to parse: ${toMessage(error)}`,
          source_path: full,
          lesson_id: null,
        })
      }
    }
  }

  return { atoms, warnings }
}

function toAtomNode(raw: RawAtom, sourcePath: string): AtomNode | null {
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
