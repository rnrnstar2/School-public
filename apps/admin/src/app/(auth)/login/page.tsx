'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { KeyRound, ShieldCheck, Sparkles } from 'lucide-react'

import { getSupabase } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = getSupabase()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#99f6e4,transparent_22%),radial-gradient(circle_at_top_right,#bfdbfe,transparent_22%),linear-gradient(180deg,#07111f_0%,#101828_45%,#07111f_100%)] px-4 py-10 text-slate-50">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),transparent_30%,rgba(59,130,246,0.12))]" />
      <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.9fr] lg:items-center">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-medium text-slate-200 backdrop-blur">
            <Sparkles className="h-4 w-4 text-emerald-300" />
            Goal-first workspace operations
          </div>
          <div className="max-w-2xl space-y-5">
            <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl">
              Manage the mentor workspace, lesson system, and intake operations from one admin console.
            </h1>
            <p className="max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Sign in with an authorized admin account. Goal-first content updates and learner-facing operations run through the same Supabase project, with server-side authorization for every write.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/8 p-5 backdrop-blur">
              <ShieldCheck className="h-6 w-6 text-emerald-300" />
              <h2 className="mt-4 text-lg font-semibold text-white">Protected writes</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                CRUD runs on the server with an admin-only gate, so mentor workspace operations stay aligned with learner data.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/8 p-5 backdrop-blur">
              <KeyRound className="h-6 w-6 text-sky-300" />
              <h2 className="mt-4 text-lg font-semibold text-white">Supabase session auth</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                The login flow reuses the existing app&apos;s client and server cookie pattern for session refresh.
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="rounded-[2rem] border border-white/10 bg-white/10 p-6 shadow-[0_30px_90px_rgba(8,15,30,0.45)] backdrop-blur-xl sm:p-8"
        >
          <div className="mb-8 space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-emerald-300">
              Admin login
            </p>
            <h2 className="text-3xl font-semibold text-white">Enter the console</h2>
            <p className="text-sm leading-6 text-slate-300">
              Accounts must be approved through `ADMIN_EMAILS` or Supabase metadata role `admin`.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ops@mentor-workspace.example"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-300/70 focus:ring-4 focus:ring-emerald-300/10"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-base text-white outline-none transition focus:border-sky-300/70 focus:ring-4 focus:ring-sky-300/10"
              />
            </label>

            {error ? (
              <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Signing in...' : 'Sign in to admin'}
            </button>
          </form>

          <p className="mt-6 text-sm leading-6 text-slate-400">
            Learner sign-in remains in the separate `apps/web` mentor workspace.
          </p>
        </motion.section>
      </div>
    </main>
  )
}
