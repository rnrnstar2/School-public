import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

const LOCAL_SUPABASE_HOSTS = new Set(['127.0.0.1', 'localhost'])
const DEFAULT_LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

function isLocalSupabaseUrl(value: string) {
  try {
    const parsed = new URL(value)
    return LOCAL_SUPABASE_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

/**
 * Create a Supabase client with the service role key.
 * Used for server-side operations that bypass RLS (cron jobs, admin tasks).
 * Returns null if SUPABASE_SERVICE_ROLE_KEY is not configured.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? (url && isLocalSupabaseUrl(url) ? DEFAULT_LOCAL_SERVICE_ROLE_KEY : undefined)

  if (!url || !key) return null

  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
