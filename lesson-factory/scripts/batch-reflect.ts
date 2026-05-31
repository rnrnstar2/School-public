#!/usr/bin/env tsx
/**
 * batch-reflect.ts — Reflect every improved draft into its atom YAML + body.md
 *
 * Bypasses the publish pipeline's eval gate because we want every
 * claude-code-improved draft to replace the old glm-generated content,
 * even when pedagogy/execution eval is still flagged.
 *
 * Reads: logs/improve-results/atom.*.result.txt (SUCCESS only)
 * Writes: lessons/atoms/<id>.yaml and lessons/atoms/<id>.body.md
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { parseYaml, stringifyYaml } from '../src/core/yaml-io.js'

const FACTORY_DIR = join(import.meta.dirname, '..')
const IMPROVE_DIR = join(FACTORY_DIR, 'logs/improve-results')
const ATOMS_DIR = join(FACTORY_DIR, 'lessons/atoms')

type DraftFile = {
  lesson_yaml: string | Record<string, unknown>
  body_markdown?: string
}

let reflected = 0
let skipped = 0
let failed = 0
const failures: string[] = []

const resultFiles = readdirSync(IMPROVE_DIR).filter((f) => f.startsWith('atom.') && f.endsWith('.result.txt'))

for (const resultFile of resultFiles) {
  const atomId = resultFile.replace(/\.result\.txt$/, '')
  const fullResult = readFileSync(join(IMPROVE_DIR, resultFile), 'utf8')

  if (!fullResult.includes('SUCCESS')) {
    skipped++
    continue
  }

  const draftMatch = fullResult.match(/^draft: (.+)$/m)
  if (!draftMatch) {
    skipped++
    continue
  }
  const draftPath = draftMatch[1].trim()
  if (!existsSync(draftPath)) {
    failures.push(`${atomId}: draft not found at ${draftPath}`)
    failed++
    continue
  }

  try {
    const draft = JSON.parse(readFileSync(draftPath, 'utf8')) as DraftFile

    if (!draft.lesson_yaml) {
      failures.push(`${atomId}: no lesson_yaml in draft`)
      failed++
      continue
    }

    // lesson_yaml can be either a YAML string (from some adapters) or an
    // object. Normalize to an object so we can reliably patch fields.
    let lessonObj: Record<string, unknown>
    if (typeof draft.lesson_yaml === 'string') {
      lessonObj = parseYaml<Record<string, unknown>>(draft.lesson_yaml)
    } else {
      lessonObj = draft.lesson_yaml as Record<string, unknown>
    }

    // Preserve freshness timestamps by keeping the existing atom's
    // created_at if present. Status is always non-stable after reflection.
    const existingAtomPath = join(ATOMS_DIR, `${atomId}.yaml`)
    if (existsSync(existingAtomPath)) {
      try {
        const existing = parseYaml<Record<string, unknown>>(readFileSync(existingAtomPath, 'utf8'))
        if (existing.created_at && !lessonObj.created_at) {
          lessonObj.created_at = existing.created_at
        }
      } catch {
        // Ignore parse errors on existing — treat as fresh write
      }
    }

    // Pin status to experimental (non-stable, owner can promote later)
    if (lessonObj.status === 'stable' || !lessonObj.status) {
      lessonObj.status = 'experimental'
    }

    // Write atom YAML
    const yamlOut = stringifyYaml(lessonObj)
    writeFileSync(existingAtomPath, yamlOut, 'utf8')

    // Write body markdown if present
    if (draft.body_markdown) {
      writeFileSync(join(ATOMS_DIR, `${atomId}.body.md`), draft.body_markdown, 'utf8')
    }

    reflected++
    if (reflected % 50 === 0) {
      console.log(`[reflect] progress: ${reflected} reflected`)
    }
  } catch (err) {
    failures.push(`${atomId}: ${(err as Error).message}`)
    failed++
  }
}

console.log('')
console.log('========== REFLECT SUMMARY ==========')
console.log(`Reflected: ${reflected}`)
console.log(`Skipped  : ${skipped}`)
console.log(`Failed   : ${failed}`)
if (failures.length > 0) {
  console.log('')
  console.log('Failures (first 20):')
  failures.slice(0, 20).forEach((f) => console.log(`  - ${f}`))
}
