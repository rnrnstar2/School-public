import type { ReactNode } from 'react'

import { AdminShell } from '@/components/admin/admin-shell'
import { ensureAdminAccess } from '@/lib/admin-auth'

export default async function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  const user = await ensureAdminAccess()

  return <AdminShell userEmail={user.email ?? 'admin'}>{children}</AdminShell>
}
