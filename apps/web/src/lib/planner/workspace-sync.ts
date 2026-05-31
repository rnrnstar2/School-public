'use client'

import { getSupabase } from '@/lib/supabase/client'
import type { Json } from '@/lib/supabase/database.types'
import type { PlannerWorkspaceSnapshot } from '@/lib/planner/types'

// ---------------------------------------------------------------------------
// Debounce timer per goal to avoid flooding DB on rapid edits
// ---------------------------------------------------------------------------
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 1_500

function buildGoalKey(goal: string) {
  return goal.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Push: localStorage → DB (debounced, fire-and-forget)
// ---------------------------------------------------------------------------

async function pushSnapshotToDB(goalKey: string, snapshot: PlannerWorkspaceSnapshot) {
  const supabase = getSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return // anonymous users stay localStorage-only

  const { error } = await supabase
    .from('workspace_snapshots')
    .upsert(
      {
        user_id: user.id,
        goal_key: goalKey,
        snapshot: JSON.parse(JSON.stringify(snapshot)) as Json,
        saved_at: snapshot.savedAt ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,goal_key' }
    )

  if (error) {
    console.warn('[workspace-sync] push failed:', error.message)
  }
}

/**
 * Schedule a debounced push of the snapshot to Supabase.
 * Safe to call on every localStorage write — only the last call within
 * DEBOUNCE_MS will actually hit the DB.
 */
export function scheduleSyncToDB(snapshot: PlannerWorkspaceSnapshot) {
  const goalKey = buildGoalKey(snapshot.goal)

  const existing = pendingTimers.get(goalKey)
  if (existing) clearTimeout(existing)

  pendingTimers.set(
    goalKey,
    setTimeout(() => {
      pendingTimers.delete(goalKey)
      pushSnapshotToDB(goalKey, snapshot).catch(() => {
        // swallow — already logged inside pushSnapshotToDB
      })
    }, DEBOUNCE_MS)
  )
}

// ---------------------------------------------------------------------------
// Delete: remove snapshot from DB when cleared locally
// ---------------------------------------------------------------------------

export async function deleteSyncedSnapshot(goal: string) {
  const supabase = getSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const goalKey = buildGoalKey(goal)

  // Cancel any pending push
  const existing = pendingTimers.get(goalKey)
  if (existing) {
    clearTimeout(existing)
    pendingTimers.delete(goalKey)
  }

  const { error } = await supabase
    .from('workspace_snapshots')
    .delete()
    .eq('user_id', user.id)
    .eq('goal_key', goalKey)

  if (error) {
    console.warn('[workspace-sync] delete failed:', error.message)
  }
}

// ---------------------------------------------------------------------------
// Pull: DB → localStorage (called on login / app init)
// Conflict resolution: last-write-wins by savedAt timestamp
// ---------------------------------------------------------------------------

export interface RestoreResult {
  restored: number
  merged: number
}

// ---------------------------------------------------------------------------
// In-memory restore cache: the header mounts on every client navigation, so
// without this the restore query fires on every SPA transition. We keep the
// result for the lifetime of the JS module (i.e. until a full reload). A
// sign-out clears the cache via clearRestoreCache().
// ---------------------------------------------------------------------------
let restoreInFlight: Promise<RestoreResult> | null = null
let restoredForUserId: string | null = null

export function clearRestoreCache() {
  restoreInFlight = null
  restoredForUserId = null
}

/**
 * Fetch all workspace snapshots from DB for the current user and merge
 * them into localStorage using last-write-wins on `savedAt`.
 *
 * Returns counts of restored (new) and merged (overwritten) snapshots.
 *
 * Result is memoized per-user for the lifetime of the module — subsequent
 * calls from the same session become a no-op so client-side navigations
 * don't re-issue the workspace_snapshots query every header mount.
 */
export async function restoreSnapshotsFromDB(): Promise<RestoreResult> {
  const emptyResult: RestoreResult = { restored: 0, merged: 0 }

  if (typeof window === 'undefined') return emptyResult

  // If a restore is already in flight, piggy-back on it.
  if (restoreInFlight) {
    return restoreInFlight
  }

  const supabase = getSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return emptyResult

  // If we've already restored for this user in this session, skip.
  if (restoredForUserId === user.id) {
    return emptyResult
  }

  restoreInFlight = performRestore(user.id).finally(() => {
    restoreInFlight = null
  })
  return restoreInFlight
}

async function performRestore(userId: string): Promise<RestoreResult> {
  const STORAGE_KEY = 'school:mentor-workspace-v2'
  const result: RestoreResult = { restored: 0, merged: 0 }
  const supabase = getSupabase()

  const { data: rows, error } = await supabase
    .from('workspace_snapshots')
    .select('goal_key, snapshot, saved_at')
    .eq('user_id', userId)

  if (error || !rows) {
    console.warn('[workspace-sync] restore failed:', error?.message)
    return result
  }

  // Read current localStorage state
  let localStore: Record<string, PlannerWorkspaceSnapshot> = {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      localStore = JSON.parse(raw) as Record<string, PlannerWorkspaceSnapshot>
    }
  } catch {
    localStore = {}
  }

  for (const row of rows) {
    const goalKey = row.goal_key
    const dbSnapshot = row.snapshot as unknown as PlannerWorkspaceSnapshot
    const dbSavedAt = row.saved_at

    const localSnapshot = localStore[goalKey]

    if (!localSnapshot) {
      // DB has it, local doesn't → restore
      localStore[goalKey] = dbSnapshot
      result.restored++
    } else {
      // Both exist → last-write-wins
      const localTime = new Date(localSnapshot.savedAt ?? 0).getTime()
      const dbTime = new Date(dbSavedAt ?? 0).getTime()

      if (dbTime > localTime) {
        localStore[goalKey] = dbSnapshot
        result.merged++
      }
      // else: local is newer, keep it (and it will be pushed on next write)
    }
  }

  // Write merged state back
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(localStore))

  // Mark session-level memoization so subsequent header mounts skip the query.
  restoredForUserId = userId

  return result
}
