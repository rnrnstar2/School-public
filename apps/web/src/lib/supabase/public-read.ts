import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Create a Supabase client for reading publicly readable content.
 *
 * Uses the anon key (no cookies, no session) and is intended for tables
 * whose RLS policies grant SELECT to the `public` role (lesson_atoms,
 * lesson_atom_versions, lesson_atom_capabilities, lesson_atom_prerequisites,
 * lesson_anchors, personas, persona_versions, domains, ...).
 *
 * Prefer this over `createServiceClient()` for public content reads — it
 * follows least-privilege and removes the production dependency on
 * `SUPABASE_SERVICE_ROLE_KEY` for learner-facing content delivery.
 *
 * Returns null only if the public env vars are missing, in which case
 * callers should treat the data as empty.
 */
export function createPublicReadClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) return null

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'x-supabase-client': 'school-web/public-read',
      },
    },
  })
}
