#!/usr/bin/env npx tsx
/**
 * Run the Goal-Action Judge (@school/goal-action-judge) over the eval dataset.
 *
 * Usage:
 *   pnpm goal:run-judge                       # fake mode, validation split
 *   pnpm goal:run-judge --split validation    # explicit split
 *   pnpm goal:run-judge --real-llm            # throws unless JUDGE_REAL_ENABLED=1 AND OPENAI_API_KEY set
 *
 * Output:
 *   JSON summary to stdout. Exit 0 on success (including rubric failures,
 *   which are encoded in the JSON `verdicts` array). Non-zero exit only on
 *   operational errors (dataset load failure, real-LLM guard tripped).
 */
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  createFakeJudgeLLM,
  createGpt5MiniJudgeLLM,
  runJudge,
  type FakeVerdictFixture,
  type JudgeLLM,
} from '@school/goal-action-judge'

// Static fixture bundled with the judge package. We load it via a URL-relative
// import path to keep this script self-contained.
import fakeVerdicts from '../../packages/goal-action/judge/__tests__/fixtures/fake-verdicts.json' with { type: 'json' }

type Split = 'train' | 'validation' | 'all'

interface CliArgs {
  split: Split
  realLlm: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { split: 'validation', realLlm: false }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--split') {
      const value = argv[i + 1]
      if (value !== 'train' && value !== 'validation' && value !== 'all') {
        throw new Error(`--split requires one of train|validation|all, got ${value ?? '<undef>'}`)
      }
      args.split = value
      i += 1
      continue
    }
    if (flag === '--real-llm') {
      args.realLlm = true
      continue
    }
    if (flag === '-h' || flag === '--help') {
      printHelp()
      process.exit(0)
    }
    throw new Error(`unknown flag: ${flag}`)
  }
  return args
}

function printHelp() {
  const lines = [
    'Usage: pnpm goal:run-judge [--split train|validation|all] [--real-llm]',
    '',
    'Options:',
    '  --split <name>  Dataset split to evaluate (default: validation)',
    '  --real-llm      Use the real GPT-5 mini judge client (requires',
    '                  JUDGE_REAL_ENABLED=1 and OPENAI_API_KEY). Not wired',
    '                  in this TQ — will throw by design.',
    '',
    'Environment:',
    '  JUDGE_REAL_ENABLED=1   Explicit opt-in for real LLM path.',
    '  OPENAI_API_KEY=<key>   Credentials for real LLM path.',
  ]
  console.log(lines.join('\n'))
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))

  const judgeLLM: JudgeLLM = args.realLlm
    ? createGpt5MiniJudgeLLM()
    : createFakeJudgeLLM({ fixture: fakeVerdicts as FakeVerdictFixture })

  const summary = await runJudge({
    split: args.split,
    judgeLLM,
    now: new Date().toISOString(),
  })

  process.stdout.write(JSON.stringify(summary, null, 2))
  process.stdout.write('\n')
  return 0
}

const INVOKED_DIRECTLY = (() => {
  try {
    return fileURLToPath(import.meta.url) === process.argv[1]
  } catch {
    return false
  }
})()

if (INVOKED_DIRECTLY || process.argv[1]?.endsWith('run-judge.ts')) {
  main().then(
    (code) => {
      process.exit(code)
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[run-judge] ${message}`)
      process.exit(1)
    },
  )
}
