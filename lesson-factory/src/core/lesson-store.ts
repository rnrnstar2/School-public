import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { atomFilePathForId, fromMaybeRelativePath, getLessonsAtomsDir } from './paths.js'
import { schemaValidator } from './schema-validator.js'
import type { Lesson } from './types.js'
import { parseYaml, readTextFile, writeYamlFile } from './yaml-io.js'

export interface LessonStoreEntry {
  id: string
  title: string
  status: Lesson['status']
  path: string
}

export async function listLessons(): Promise<LessonStoreEntry[]> {
  const entries = await readdir(getLessonsAtomsDir(), { withFileTypes: true })
  const lessons: LessonStoreEntry[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) {
      continue
    }

    const absolutePath = path.join(getLessonsAtomsDir(), entry.name)
    const lesson = await readLessonFromFile(absolutePath)
    lessons.push({
      id: lesson.id,
      title: lesson.title,
      status: lesson.status,
      path: absolutePath,
    })
  }

  return lessons.sort((left, right) => left.id.localeCompare(right.id))
}

export async function readLessonFromFile(filePath: string): Promise<Lesson> {
  const absolutePath = fromMaybeRelativePath(filePath)
  const contents = await readTextFile(absolutePath)
  const parsed = parseYaml<Lesson>(contents)
  return schemaValidator.validateWithSchemaFile<Lesson>('lesson.schema.json', parsed)
}

export async function readLessonById(lessonId: string): Promise<Lesson> {
  const exactPath = atomFilePathForId(lessonId)
  try {
    return await readLessonFromFile(exactPath)
  } catch {
    const entries = await listLessons()
    const match = entries.find((entry) => entry.id === lessonId)
    if (!match) {
      throw new Error(`Lesson atom not found: ${lessonId}`)
    }

    return readLessonFromFile(match.path)
  }
}

export interface WriteLessonOptions {
  dryRun?: boolean
  overwrite?: boolean
  targetPath?: string
}

export async function writeLessonAtom(
  lesson: Lesson,
  options: WriteLessonOptions = {},
): Promise<string> {
  const validated = await schemaValidator.validateWithSchemaFile<Lesson>(
    'lesson.schema.json',
    lesson,
  )
  const targetPath = options.targetPath
    ? fromMaybeRelativePath(options.targetPath)
    : atomFilePathForId(validated.id)
  const collision = await findLessonCollision(validated.id, targetPath)

  if (collision) {
    throw new Error(`Lesson id collision for ${validated.id}: ${collision}`)
  }

  const exists = await fileExists(targetPath)
  if (exists && !options.overwrite) {
    throw new Error(`Lesson file already exists: ${targetPath}`)
  }

  if (!options.dryRun) {
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeYamlFile(targetPath, validated)
  }

  return targetPath
}

async function findLessonCollision(lessonId: string, targetPath: string): Promise<string | null> {
  const lessons = await listLessons()
  const normalizedTarget = path.resolve(targetPath)
  const collision = lessons.find((entry) => entry.id === lessonId && path.resolve(entry.path) !== normalizedTarget)
  return collision?.path ?? null
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath)
    return fileStat.isFile()
  } catch {
    return false
  }
}

export async function writeLessonText(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents, 'utf8')
}
