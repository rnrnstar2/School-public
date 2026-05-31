import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { CritiqueAdapter, DraftAdapter } from '../base.js'
import type { Critique, LessonDraft, LessonDraftInput } from '../../core/types.js'

interface AdapterContext {
  instruction: string
}

function buildPrompt(instruction: string, payload: unknown): string {
  return `${instruction}\n\nReturn JSON only.\n\nINPUT:\n${JSON.stringify(payload, null, 2)}`
}

function stripMarkdownCodeFences(output: string): string {
  if (!output.startsWith('```') || !output.endsWith('```')) {
    return output
  }

  const firstNewlineIndex = output.indexOf('\n')
  if (firstNewlineIndex === -1) {
    return output
  }

  const header = output.slice(0, firstNewlineIndex).trim().toLowerCase()
  if (header !== '```' && header !== '```json') {
    return output
  }

  return output.slice(firstNewlineIndex + 1, -3).trim()
}

async function runCodexJson(prompt: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `codex-${randomUUID()}.txt`)

  try {
    const reasoningEffort = process.env.LESSON_FACTORY_CODEX_REASONING ?? 'low'
    // Scrub Claude Code codex-companion env vars so this invocation bypasses
    // the shared broker (which serialises to 1 concurrent request and deadlocks
    // when another Claude Code session is already using codex).
    const scrubbedEnv = { ...process.env }
    delete scrubbedEnv.CODEX_COMPANION_SESSION_ID
    delete scrubbedEnv.CODEX_COMPANION_APP_SERVER_ENDPOINT
    delete scrubbedEnv.CLAUDE_PLUGIN_DATA

    // Use node:child_process.spawn directly (not execa) because execa's default
    // stream handling interacts badly with codex exec and hangs indefinitely.
    // Plain spawn with a piped stderr drain and --output-last-message to read
    // the final message from a file completes cleanly.
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'codex',
        [
          'exec',
          // Route codex through tmp so it cannot discover the workspace
          // broker.json and auto-attach to the serialised companion broker.
          '-C',
          os.tmpdir(),
          '--skip-git-repo-check',
          '-s',
          'read-only',
          '--disable',
          'web_search',
          '-c',
          `model_reasoning_effort=${reasoningEffort}`,
          '--output-last-message',
          tmpPath,
          prompt,
        ],
        {
          env: scrubbedEnv,
          cwd: os.tmpdir(),
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      // Drain stdio so codex does not block on full pipe buffers.
      child.stdout.on('data', () => {})
      let stderrTail = ''
      child.stderr.on('data', (chunk: Buffer) => {
        stderrTail += chunk.toString('utf8')
        if (stderrTail.length > 4000) {
          stderrTail = stderrTail.slice(-4000)
        }
      })
      child.on('error', (err) => reject(err))
      child.on('exit', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`codex exec exited with code ${code ?? 'null'}: ${stderrTail}`))
        }
      })
    })

    const output = (await readFile(tmpPath, 'utf8')).trim()
    return stripMarkdownCodeFences(output)
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}

export function createCodexDraftAdapter(context: AdapterContext): DraftAdapter {
  return {
    async draftLesson(input: LessonDraftInput): Promise<LessonDraft> {
      const output = await runCodexJson(buildPrompt(context.instruction, input))
      return JSON.parse(output) as LessonDraft
    },
  }
}

export function createCodexCritiqueAdapter(context: AdapterContext): CritiqueAdapter {
  return {
    async critique(draft: LessonDraft): Promise<Critique> {
      const output = await runCodexJson(buildPrompt(context.instruction, draft))
      return JSON.parse(output) as Critique
    },
  }
}
