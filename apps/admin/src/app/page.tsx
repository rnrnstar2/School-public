import { redirect } from 'next/navigation'

import { getAdminSessionState } from '@/lib/admin-auth'

export default async function HomePage() {
  const session = await getAdminSessionState()

  if (!session.user) {
    redirect('/login')
  }

  if (!session.isAdmin) {
    redirect('/unauthorized')
  }

  redirect('/dashboard')
}
