import { createHash } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

import { resolveLessonFactoryPath, toRepoRelativePath } from '../core/paths.js'
import { schemaValidator } from '../core/schema-validator.js'
import { readTextFile, parseYaml } from '../core/yaml-io.js'
import type { Lesson } from '../core/types.js'

import type {
  AnchorDefinition,
  PersonaDefinition,
  SourceDocument,
  SourceKind,
  SyncSources,
} from './types.js'

const YAML_PATTERN = /\.(ya?ml)$/i

function hashYaml(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex')
}

async function directoryExists(directoryPath: string): Promise<boolean> {
  try {
    const entry = await stat(directoryPath)
    return entry.isDirectory()
  } catch {
    return false
  }
}

async function readYamlDocuments<T>({
  directoryPath,
  kind,
  schemaFileName,
}: {
  directoryPath: string
  kind: SourceKind
  schemaFileName: string
}): Promise<SourceDocument<T>[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const documents: SourceDocument<T>[] = []
  const seenIds = new Set<string>()

  for (const entry of entries) {
    if (!entry.isFile() || !YAML_PATTERN.test(entry.name)) {
      continue
    }

    const absolutePath = path.join(directoryPath, entry.name)
    const rawYaml = await readTextFile(absolutePath)
    const parsed = parseYaml<unknown>(rawYaml)
    const value = await schemaValidator.validateWithSchemaFile<T>(schemaFileName, parsed)
    const id = readId(value)

    if (seenIds.has(id)) {
      throw new Error(`Duplicate ${kind} id detected: ${id}`)
    }

    seenIds.add(id)
    documents.push({
      kind,
      id,
      absolutePath,
      relativePath: toRepoRelativePath(absolutePath),
      rawYaml,
      yamlHash: hashYaml(rawYaml),
      value,
    })
  }

  documents.sort((left, right) => left.id.localeCompare(right.id))
  return documents
}

function readId(value: unknown): string {
  if (!value || typeof value !== 'object' || !('id' in value)) {
    throw new Error('YAML document must contain an id field')
  }

  const id = value.id
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('YAML document id must be a non-empty string')
  }

  return id
}

export async function loadSyncSources(): Promise<SyncSources> {
  const atomsDirectory = resolveLessonFactoryPath('lessons', 'atoms')
  const personasDirectory = resolveLessonFactoryPath('lessons', 'personas')
  const anchorsDirectory = resolveLessonFactoryPath('lessons', 'anchors')
  const anchorsDirectoryExists = await directoryExists(anchorsDirectory)

  const atoms = await readYamlDocuments<Lesson>({
    directoryPath: atomsDirectory,
    kind: 'atom',
    schemaFileName: 'lesson.schema.json',
  })
  const personas = await readYamlDocuments<PersonaDefinition>({
    directoryPath: personasDirectory,
    kind: 'persona',
    schemaFileName: 'persona.schema.json',
  })
  const anchors = anchorsDirectoryExists
    ? await readYamlDocuments<AnchorDefinition>({
        directoryPath: anchorsDirectory,
        kind: 'anchor',
        schemaFileName: 'anchor.schema.json',
      })
    : []

  return {
    atoms,
    personas,
    anchors,
    anchorsDirectoryExists,
  }
}
