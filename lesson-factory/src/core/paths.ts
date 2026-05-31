import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { StageName } from './types.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const defaultLessonFactoryRoot = path.resolve(moduleDir, '../../')

export function getLessonFactoryRoot(): string {
  return process.env.LESSON_FACTORY_ROOT ?? defaultLessonFactoryRoot
}

export function getRepoRoot(): string {
  return process.env.REPO_ROOT ?? path.resolve(getLessonFactoryRoot(), '..')
}

export function resolveLessonFactoryPath(...segments: string[]): string {
  return path.join(getLessonFactoryRoot(), ...segments)
}

export function resolveRepoPath(...segments: string[]): string {
  return path.join(getRepoRoot(), ...segments)
}

export function fromRepoRelativePath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.join(getRepoRoot(), inputPath)
}

export function getSchemasDir(): string {
  return resolveLessonFactoryPath('schemas')
}

export function getLessonsAtomsDir(): string {
  return resolveLessonFactoryPath('lessons', 'atoms')
}

export function getRunsLogDir(): string {
  return resolveLessonFactoryPath('logs', 'runs')
}

export function getUnsupportedGoalsDir(): string {
  return resolveLessonFactoryPath('logs', 'unsupported-goals')
}

export function getAssetsImagesDir(): string {
  return resolveLessonFactoryPath('assets', 'images')
}

export function getAssetsVideosDir(): string {
  return resolveLessonFactoryPath('assets', 'videos')
}

export function getRubricsDir(): string {
  return resolveLessonFactoryPath('evals', 'rubrics')
}

export function getPersonasDir(): string {
  return resolveLessonFactoryPath('evals', 'personas')
}

export function getStagePromptPath(stage: StageName): string {
  return resolveLessonFactoryPath('pipelines', stage, 'PROMPT.md')
}

export function atomFilePathForId(lessonId: string): string {
  return path.join(getLessonsAtomsDir(), `${lessonId}.yaml`)
}

export function toRepoRelativePath(absolutePath: string): string {
  return path.relative(getRepoRoot(), absolutePath).replace(/\\/g, '/')
}

export function fromMaybeRelativePath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath)
}

export function createTimestampForFile(date: Date = new Date()): string {
  return date.toISOString().replaceAll(':', '-')
}

export function createStageArtifactPath(
  timestamp: string,
  stage: StageName,
  extension: string,
  suffix = '',
): string {
  return path.join(getRunsLogDir(), `${timestamp}-${stage}${suffix}.${extension}`)
}
