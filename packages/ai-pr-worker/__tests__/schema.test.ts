import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  OWNER_APPROVAL_VALUES,
  WORKER_RUN_STATUS_VALUES,
} from '../src/schema.js'

const TEST_DIR = fileURLToPath(new URL('.', import.meta.url))
const MIGRATION_PATH = resolve(
  TEST_DIR,
  '../../../apps/web/supabase/migrations/20260417220000_ai_pr_worker_runs.sql',
)

describe('ai_pr_worker schema contract', () => {
  it('defines the owner approval enum and worker run statuses in TypeScript', () => {
    expect(OWNER_APPROVAL_VALUES).toEqual(['pending', 'approved', 'rejected'])
    expect(WORKER_RUN_STATUS_VALUES).toContain('pending_owner_approval')
    expect(WORKER_RUN_STATUS_VALUES).toContain('rate_limited')
  })

  it('creates owner_approval and ai_pr_worker_runs with RLS policies', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')

    expect(sql).toContain('CREATE TYPE decision_ledger.owner_approval AS ENUM')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS owner_approval')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS decision_ledger.ai_pr_worker_runs')
    expect(sql).toContain('DROP FUNCTION IF EXISTS decision_ledger.claim_ai_pr_worker_run(')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION decision_ledger.claim_ai_pr_worker_run')
    expect(sql).toContain('DROP FUNCTION IF EXISTS decision_ledger.update_action_backlink(')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION decision_ledger.update_action_backlink(')
    expect(sql).toContain('RETURNS decision_ledger.proposed_actions')
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('v_limit constant integer := 3;')
    expect(sql).toContain('v_now constant timestamptz := now();')
    expect(sql).toContain('ALTER TABLE decision_ledger.ai_pr_worker_runs ENABLE ROW LEVEL SECURITY;')
    expect(sql).toContain('CREATE POLICY ai_pr_worker_runs_owner_select')
    expect(sql).toContain("IN ('admin', 'owner')")
    expect(sql).toContain('CREATE POLICY ai_pr_worker_runs_worker_insert')
    expect(sql).toContain("= 'worker'")
    expect(sql).toContain('CREATE POLICY service_role_all')
  })
})
