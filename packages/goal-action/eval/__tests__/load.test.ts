import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadEvalDataset,
  resolveGoalSplit,
  validateLessonIdsAgainstWorkspace,
} from '../src/load.js'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TEST_DIR, '../../../../')
const DATASET_DIR = path.join(REPO_ROOT, 'eval-datasets/goal-action/v0')

const tempRoots: string[] = []

async function createTempDatasetRoot() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'goal-action-eval-'))
  tempRoots.push(tempRoot)

  const targetDir = path.join(tempRoot, 'eval-datasets/goal-action/v0')
  await cp(DATASET_DIR, targetDir, { recursive: true })

  return {
    tempRoot,
    datasetDir: targetDir,
  }
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, { recursive: true, force: true })))
})

describe('loadEvalDataset', () => {
  it('rejects schema violations', async () => {
    const { tempRoot, datasetDir } = await createTempDatasetRoot()
    const goalsPath = path.join(datasetDir, 'goals.jsonl')
    const invalidGoal = JSON.stringify({
      goalId: 'goal-invalid-001',
      text: '',
      domain: 'commerce',
      createdAt: 'not-a-date',
    })

    const original = await readFile(goalsPath, 'utf8')
    const [, ...rest] = original.split(/\r?\n/u).filter((line) => line.length > 0)
    await writeFile(goalsPath, [invalidGoal, ...rest].join('\n'))

    await expect(
      loadEvalDataset('v0', {
        rootDir: tempRoot,
        workspaceRoot: REPO_ROOT,
      }),
    ).rejects.toThrow(/schema validation failed/i)
  })

  it('returns a deterministic 70\/30 split and keeps gaps in validation', async () => {
    const trainA = await loadEvalDataset('v0', { split: 'train', workspaceRoot: REPO_ROOT })
    const trainB = await loadEvalDataset('v0', { split: 'train', workspaceRoot: REPO_ROOT })
    const validation = await loadEvalDataset('v0', { split: 'validation', workspaceRoot: REPO_ROOT })
    const all = await loadEvalDataset('v0', { split: 'all', workspaceRoot: REPO_ROOT })

    expect(trainA.goals.map((goal) => goal.goalId)).toEqual(trainB.goals.map((goal) => goal.goalId))
    expect(trainA.goals).toHaveLength(7)
    expect(validation.goals).toHaveLength(3)
    expect(trainA.expectedGaps).toHaveLength(0)
    expect(validation.expectedGaps).toHaveLength(5)
    expect(trainA.goals.length + validation.goals.length).toBe(all.goals.length)
    expect(validation.goals.every((goal) => resolveGoalSplit(goal.goalId) === 'validation')).toBe(true)
  })

  it('verifies that expected lesson ids exist in the workspace', async () => {
    const dataset = await loadEvalDataset('v0', { split: 'all', workspaceRoot: REPO_ROOT })
    const validation = await validateLessonIdsAgainstWorkspace(dataset.expectedLessons, {
      workspaceRoot: REPO_ROOT,
    })

    expect(validation.missingIds).toEqual([])
    expect(validation.availableIds).toContain('atom.web-builder.create-homepage')
    expect(validation.availableIds).toContain('atom.data-analyst.detect-seasonality')
  })

  it('rejects expectedGaps whose actionId is not declared in expectedActions', async () => {
    const { tempRoot, datasetDir } = await createTempDatasetRoot()
    const gapsPath = path.join(datasetDir, 'expected-gaps.jsonl')
    const original = await readFile(gapsPath, 'utf8')
    const firstGap = JSON.parse(original.split(/\r?\n/u).find((line) => line.length > 0)!) as {
      actionId: string
    }
    const typoedGap = JSON.stringify({ ...firstGap, actionId: `${firstGap.actionId}-typo` })
    await writeFile(gapsPath, `${original.trimEnd()}\n${typoedGap}\n`)

    await expect(
      loadEvalDataset('v0', {
        rootDir: tempRoot,
        workspaceRoot: REPO_ROOT,
      }),
    ).rejects.toThrow(/references missing expected action/i)
  })
})
