'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

import { getSupabase } from '@/lib/supabase/client'

export function SignOutButton({
  variant = 'primary',
}: {
  variant?: 'primary' | 'secondary'
}) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = getSupabase()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const className =
    variant === 'secondary'
      ? 'inline-flex items-center gap-2 rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-900 hover:text-stone-950'
      : 'inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/14'

  return (
    <button type="button" onClick={handleSignOut} className={className}>
      <LogOut className="h-4 w-4" />
      Sign out
    </button>
  )
}
