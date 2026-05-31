import 'server-only'

import type { User } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

function parseAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  )
}

export function isAdminUser(user: User | null) {
  if (!user) {
    return false
  }

  const adminEmails = parseAdminEmails()
  const normalizedEmail = user.email?.toLowerCase()
  const appRole = user.app_metadata?.role
  const userRole = user.user_metadata?.role

  return (
    appRole === 'admin' ||
    userRole === 'admin' ||
    (normalizedEmail ? adminEmails.has(normalizedEmail) : false)
  )
}

export async function getAdminSessionState() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return {
    user,
    isAdmin: isAdminUser(user),
  }
}

export async function requireAdminUser() {
  const { user, isAdmin } = await getAdminSessionState()

  if (!user) {
    throw new Error('UNAUTHENTICATED')
  }

  if (!isAdmin) {
    throw new Error('UNAUTHORIZED')
  }

  return user
}

export async function ensureAdminAccess() {
  const { user, isAdmin } = await getAdminSessionState()

  if (!user) {
    redirect('/login')
  }

  if (!isAdmin) {
    redirect('/unauthorized')
  }

  return user
}
