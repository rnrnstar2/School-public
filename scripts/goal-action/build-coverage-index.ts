#!/usr/bin/env npx tsx
/**
 * Build a Coverage Index snapshot and insert it into Supabase.
 *
 * Usage:
 *   pnpm goal:build-coverage
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL       — Supabase URL (local: http://127.0.0.1:54341)
 *   SUPABASE_SERVICE_ROLE_KEY      — service role key for local Supabase
 *
 * Non-goals (explicitly deferred per TQ-131 spec):
 *   - Ledger writes (G2A-005+)
 *   - Action normalization (G2A-002)
 *   - Matching + gap detection (G2A-003 / G2A-004)
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import {
  buildCoverageIndex,
  COVERAGE_INDEX_SCHEMA_VERSION,
} from '@school/goal-action-coverage'
import { createClient } from '@supabase/supabase-js'

async function dirExists(abs: string): Promise<boolean> {
  try {
    const stat = await fs.stat(abs)
    return stat.isDirectory()
  } catch {
    return false
  }
}

const REPO_ROOT = process.cwd()

async function main(): Promise<void> {
  const factoryDir = path.join(
    REPO_ROOT,
    'lesson-factory',
    'lessons',
    'atoms',
  )

  // Atom sources: apps/web/src/data/atoms/ is a legacy layout that may not
  // exist in every branch. We only pass it when it actually exists; adding
  // a guaranteed-missing absolute path would produce an `unreadable_source`
  // warning whose message embeds the checkout location, which would then
  // leak into `content_hash` and make snapshots environment-dependent.
  const legacyAtomDir = path.join(REPO_ROOT, 'apps', 'web', 'src', 'data', 'atoms')
  const atomSources = (await dirExists(legacyAtomDir)) ? [{ dir: legacyAtomDir }] : []

  const logger = {
    warn: (message: string) => {
      console.warn(`[coverage-index] ${message}`)
    },
  }

  const index = await buildCoverageIndex({
    atomSources,
    factorySources: [{ dir: factoryDir }],
    logger,
    builtAt: new Date().toISOString(),
  })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required',
    )
  }

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await client
    .from('coverage_index_snapshots')
    .insert({
      schema_version: index.schema_version,
      content_hash: index.content_hash,
      built_at: index.built_at,
      payload: index as unknown as Record<string, unknown>,
    })
    .select('id, built_at')
    .single()

  if (error) {
    throw new Error(`insert failed: ${error.message}`)
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        snapshot_id: data?.id ?? null,
        schema_version: COVERAGE_INDEX_SCHEMA_VERSION,
        content_hash: index.content_hash,
        lessons: index.lessons.length,
        atoms: index.atoms.length,
        capabilities: index.capabilities.length,
        support_assets: index.support_assets.length,
        warnings: index.warnings.length,
      },
      null,
      2,
    ),
  )
  console.log(`schema_version=${index.schema_version}`)
  console.log(`content_hash=${index.content_hash}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[coverage-index] ${message}`)
  process.exit(1)
})
