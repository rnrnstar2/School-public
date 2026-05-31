import os from 'node:os'
import path from 'node:path'
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const testsDir = path.dirname(fileURLToPath(import.meta.url))
const actualLessonFactoryRoot = path.resolve(testsDir, '..')

export function fixturePath(name: string): string {
  return path.join(actualLessonFactoryRoot, 'tests', 'fixtures', name)
}

export async function withTempLessonFactory<T>(
  callback: (context: { lessonFactoryRoot: string; repoRoot: string }) => Promise<T>,
): Promise<T> {
  const tempBase = await mkdtemp(path.join(os.tmpdir(), 'lesson-factory-'))
  const tempLessonFactoryRoot = path.join(tempBase, 'lesson-factory')
  const previousLessonFactoryRoot = process.env.LESSON_FACTORY_ROOT
  const previousRepoRoot = process.env.REPO_ROOT

  // Exclude heavy directories that aren't needed by any test-exercised code
  // path. assets/ grew to ~384MB / 1800+ files, logs/ holds ~45MB and ~9k
  // per-run files, and node_modules/ / dist/ are build output. Leaving them
  // in the cp filter blows past the default 5s vitest timeout (x16 tests).
  // All consumers that write into these paths use mkdir({recursive:true}),
  // so an empty (or missing) directory inside the temp copy is safe.
  const excludedTopLevel = new Set(['assets', 'logs', 'node_modules', 'dist'])
  await cp(actualLessonFactoryRoot, tempLessonFactoryRoot, {
    recursive: true,
    force: true,
    filter: (src) => {
      if (src === actualLessonFactoryRoot) return true
      const rel = path.relative(actualLessonFactoryRoot, src)
      if (!rel || rel.startsWith('..')) return true
      // strict tsconfig では split()[0] は `string | undefined` を返すため `?? ''` で narrow する。
      // rel が空でないパスである限り split の先頭要素は常に非 undefined な文字列になるが、
      // 型安全のためフォールバックを入れる。`excludedTopLevel.has('')` は false なので
      // 空文字列フォールバック時の挙動は「除外しない」で既存実装と等価になる。
      const top = rel.split(path.sep)[0] ?? ''
      return !excludedTopLevel.has(top)
    },
  })
  await mkdir(path.join(tempLessonFactoryRoot, 'assets', 'images'), { recursive: true })
  await mkdir(path.join(tempLessonFactoryRoot, 'assets', 'videos'), { recursive: true })

  process.env.LESSON_FACTORY_ROOT = tempLessonFactoryRoot
  process.env.REPO_ROOT = tempBase

  try {
    return await callback({
      lessonFactoryRoot: tempLessonFactoryRoot,
      repoRoot: tempBase,
    })
  } finally {
    if (previousLessonFactoryRoot) {
      process.env.LESSON_FACTORY_ROOT = previousLessonFactoryRoot
    } else {
      delete process.env.LESSON_FACTORY_ROOT
    }

    if (previousRepoRoot) {
      process.env.REPO_ROOT = previousRepoRoot
    } else {
      delete process.env.REPO_ROOT
    }

    await rm(tempBase, { recursive: true, force: true })
  }
}
