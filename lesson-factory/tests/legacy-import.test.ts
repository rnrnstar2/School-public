import path from 'node:path'
import { access, readFile, readdir, writeFile } from 'node:fs/promises'

import { schemaValidator } from '../src/core/schema-validator.js'
import { parseYaml } from '../src/core/yaml-io.js'
import { runLegacyImport } from '../src/legacy/import.js'
import { fixturePath, withTempLessonFactory } from './helpers.js'

describe('legacy import', () => {
  const sourceDir = fixturePath('legacy-curriculum')

  it('generates schema-valid lesson atoms and body sidecars from the legacy fixtures', async () => {
    await withTempLessonFactory(async ({ lessonFactoryRoot }) => {
      const outDir = path.join(lessonFactoryRoot, 'tests-output', 'legacy-import')
      const result = await runLegacyImport({
        sourceDir,
        outDir,
      })

      expect(result.counts.totalLessons).toBe(5)
      expect(result.counts.writeCount).toBe(5)
      expect(result.goalTagCoverage).toEqual(
        expect.arrayContaining(['mvp-planning', 'setup-environment', 'start-project', 'website-launch']),
      )

      const outputFiles = await readdir(outDir)
      expect(outputFiles.filter((fileName) => fileName.endsWith('.yaml'))).toHaveLength(5)
      expect(outputFiles.filter((fileName) => fileName.endsWith('.body.md'))).toHaveLength(5)

      for (const lesson of result.lessons) {
        const yamlSource = await readFile(lesson.yamlPath, 'utf8')
        const parsedLesson = parseYaml(yamlSource)

        await expect(
          schemaValidator.validateWithSchemaFile('lesson.schema.json', parsedLesson),
        ).resolves.toMatchObject({
          id: lesson.atomId,
        })

        const bodyMarkdown = await readFile(lesson.bodyPath, 'utf8')
        expect(bodyMarkdown.trim()).not.toBe('')
        expect(bodyMarkdown).toContain('## なぜこのレッスン')
        expect(bodyMarkdown).toContain('## 手順')
      }
    })
  })

  it('converts legacy prerequisite ids into atom ids', async () => {
    await withTempLessonFactory(async ({ lessonFactoryRoot }) => {
      const outDir = path.join(lessonFactoryRoot, 'tests-output', 'legacy-prereqs')
      await runLegacyImport({
        sourceDir,
        outDir,
      })

      const yamlSource = await readFile(
        path.join(outDir, 'atom.web-builder.git-github-cli.yaml'),
        'utf8',
      )
      const parsed = parseYaml<{ hard_prerequisites: string[] }>(yamlSource)

      expect(parsed.hard_prerequisites).toEqual(['atom.web-builder.node-pnpm-setup'])
    })
  })

  it('infers code_snippet deliverables from code-oriented keywords', async () => {
    await withTempLessonFactory(async ({ lessonFactoryRoot }) => {
      const outDir = path.join(lessonFactoryRoot, 'tests-output', 'legacy-deliverable')
      await runLegacyImport({
        sourceDir,
        outDir,
      })

      const yamlSource = await readFile(
        path.join(outDir, 'atom.web-builder.git-github-cli.yaml'),
        'utf8',
      )
      const parsed = parseYaml<{
        deliverable: { type: string; validation: string }
        evidence: string[]
      }>(yamlSource)

      expect(parsed.deliverable).toEqual({
        type: 'code_snippet',
        validation: 'basic_manual_check_v1',
      })
      expect(parsed.evidence).toEqual(['test_result'])
    })
  })

  it('does not write any files in dry-run mode', async () => {
    await withTempLessonFactory(async ({ lessonFactoryRoot }) => {
      const outDir = path.join(lessonFactoryRoot, 'tests-output', 'legacy-dry-run')
      const result = await runLegacyImport({
        sourceDir,
        outDir,
        dryRun: true,
      })

      expect(result.counts.writeCount).toBe(5)
      await expect(access(outDir)).rejects.toThrow()
    })
  })

  it('skips existing files by default and overwrites them with force', async () => {
    await withTempLessonFactory(async ({ lessonFactoryRoot }) => {
      const outDir = path.join(lessonFactoryRoot, 'tests-output', 'legacy-force')

      await runLegacyImport({
        sourceDir,
        outDir,
      })

      const targetYamlPath = path.join(outDir, 'atom.web-builder.choose-project-goal.yaml')
      await writeFile(targetYamlPath, 'sentinel: keep-existing\n', 'utf8')

      const skipped = await runLegacyImport({
        sourceDir,
        outDir,
      })
      expect(skipped.counts.skipCount).toBe(5)
      expect(await readFile(targetYamlPath, 'utf8')).toBe('sentinel: keep-existing\n')

      const overwritten = await runLegacyImport({
        sourceDir,
        outDir,
        force: true,
      })
      expect(overwritten.counts.writeCount).toBe(5)
      expect(await readFile(targetYamlPath, 'utf8')).toContain(
        'id: atom.web-builder.choose-project-goal',
      )
    })
  })
})
