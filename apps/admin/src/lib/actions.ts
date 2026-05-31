'use server'

import { revalidatePath } from 'next/cache'

import { requireAdminUser } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/service'

function requireText(value: FormDataEntryValue | null, field: string) {
  const text = value?.toString().trim() ?? ''

  if (!text) {
    throw new Error(`${field} is required`)
  }

  return text
}

export async function acknowledgeImprovementProposalAction(formData: FormData) {
  await requireAdminUser()
  const supabase = createAdminClient()
  const proposalId = requireText(formData.get('proposal_id'), 'proposal id')

  const { error } = await supabase
    .from('improvement_proposals')
    .update({ acknowledged: true })
    .eq('proposal_id', proposalId)

  if (error) {
    throw error
  }

  revalidatePath('/admin/improvement-proposals')
}
