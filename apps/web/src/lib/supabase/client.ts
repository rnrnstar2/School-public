import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// シングルトンクライアント（Client Components用）
// 遅延初期化でビルド時のエラーを回避
let _supabase: SupabaseClient<Database> | null = null

export function getSupabase(): SupabaseClient<Database> {
  if (!_supabase) {
    _supabase = createClient()
  }
  return _supabase
}

// 後方互換性のためのエクスポート（getSupabaseの使用を推奨）
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop) {
    return getSupabase()[prop as keyof SupabaseClient<Database>]
  }
})
