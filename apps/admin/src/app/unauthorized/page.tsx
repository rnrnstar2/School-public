import Link from 'next/link'

import { AlertTriangle, ArrowLeft, ShieldX } from 'lucide-react'

import { SignOutButton } from '@/components/admin/sign-out-button'
import { getAdminSessionState } from '@/lib/admin-auth'

export default async function UnauthorizedPage() {
  const session = await getAdminSessionState()

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#fef3c7,transparent_28%),radial-gradient(circle_at_bottom_right,#fed7aa,transparent_24%),linear-gradient(180deg,#fff7ed_0%,#ffffff_45%,#fffbeb_100%)] px-4 py-10 text-stone-900">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(251,191,36,0.08),transparent_35%,rgba(249,115,22,0.08))]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-4xl items-center justify-center">
        <section className="w-full rounded-[2rem] border border-white/70 bg-white/80 p-8 shadow-[0_30px_80px_rgba(120,53,15,0.14)] backdrop-blur xl:p-12">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                Admin access required
              </div>
              <div className="space-y-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-900 text-white shadow-lg shadow-amber-500/20">
                  <ShieldX className="h-8 w-8" />
                </div>
                <h1 className="text-4xl font-semibold tracking-tight text-stone-950">
                  This account can sign in, but it is not authorized for the admin console.
                </h1>
                <p className="text-base leading-7 text-stone-600">
                  {session.user?.email
                    ? `Signed in as ${session.user.email}. Add this email to ADMIN_EMAILS or mark the Supabase user metadata role as admin to grant access.`
                    : 'No active session was found. Sign in with an admin account to continue.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-900 hover:text-stone-950"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to login
                </Link>
                {session.user ? <SignOutButton variant="secondary" /> : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
