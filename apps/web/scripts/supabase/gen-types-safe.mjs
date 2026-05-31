import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const webDir = resolve(scriptDir, '..', '..')
const outputPath = resolve(webDir, 'src/lib/supabase/database.types.ts')
const dbUrl =
  process.env.LOCAL_SUPABASE_DB_URL
  ?? process.env.SUPABASE_DB_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54342/postgres'

function looksValidTypegenOutput(source) {
  return source.includes('decision_ledger:') &&
    source.includes('approval_gates:') &&
    source.includes('reject_lesson_proposal:')
}

const generated = execFileSync(
  'pnpm',
  [
    'exec',
    'supabase',
    'gen',
    'types',
    'typescript',
    '--db-url',
    dbUrl,
    '--schema',
    'public',
    '--schema',
    'decision_ledger',
  ],
  {
    cwd: webDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  },
)

if (looksValidTypegenOutput(generated)) {
  writeFileSync(outputPath, generated)
  process.exit(0)
}

if (existsSync(outputPath)) {
  const existing = readFileSync(outputPath, 'utf8')
  if (looksValidTypegenOutput(existing)) {
    console.warn(
      'supabase gen types returned an incomplete schema snapshot; keeping existing generated types.',
    )
    process.exit(0)
  }
}

console.error('supabase gen types returned an incomplete schema snapshot and no valid generated fallback exists.')
process.exit(1)
