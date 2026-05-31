import path from 'node:path'
import { access, readFile } from 'node:fs/promises'

import { readLessonById, writeLessonAtom } from '../src/core/lesson-store.js'
import type { Lesson } from '../src/core/types.js'
import { withTempLessonFactory } from './helpers.js'

describe('lesson-store', () => {
  const lesson: Lesson = {
    id: 'atom.mock.lesson-store',
    title: 'Lesson Store Smoke',
    persona_tags: ['web-builder'],
    goal_tags: ['storage'],
    capability_inputs: ['owner-request-normalized'],
    capability_outputs: ['write-lesson-yaml'],
    hard_prerequisites: [],
    soft_prerequisites: [],
    deliverable: {
      type: 'markdown_doc',
      validation: 'owner_local_review_v1',
    },
    evidence: ['url'],
    media_slots: [],
    freshness_sources: ['docs/storage'],
    status: 'draft',
  }

  it('writes and reads lesson atoms', async () => {
    await withTempLessonFactory(async ({ lessonFactoryRoot }) => {
      const targetPath = path.join(lessonFactoryRoot, 'lessons', 'atoms', `${lesson.id}.yaml`)
      await writeLessonAtom(lesson, {
        targetPath,
      })
      await access(targetPath)

      const contents = await readFile(targetPath, 'utf8')
      expect(contents).toContain(`id: ${lesson.id}`)

      const loaded = await readLessonById(lesson.id)
      expect(loaded.title).toBe(lesson.title)
    })
  })

  it('rejects lesson id collisions across different files', async () => {
    await withTempLessonFactory(async ({ lessonFactoryRoot }) => {
      const firstPath = path.join(lessonFactoryRoot, 'lessons', 'atoms', `${lesson.id}.yaml`)
      const secondPath = path.join(lessonFactoryRoot, 'lessons', 'atoms', `duplicate.${lesson.id}.yaml`)

      await writeLessonAtom(lesson, {
        targetPath: firstPath,
      })

      await expect(
        writeLessonAtom(lesson, {
          targetPath: secondPath,
        }),
      ).rejects.toThrow(/collision/i)
    })
  })
})
