import { describe, expect, it } from 'vitest'

import {
  approvalStateToProposalStatus,
  resolveOwnerApproval,
} from '../src/gate/policy.js'

describe('gate policy', () => {
  it('auto-approves only existing lesson micro patches', () => {
    expect(resolveOwnerApproval('micro_patch_existing_lesson')).toBe('auto')
    expect(approvalStateToProposalStatus('auto')).toBe('approved')
  })

  it('routes structural work through owner review', () => {
    expect(resolveOwnerApproval('lesson_rewrite')).toBe('pending_owner_review')
    expect(resolveOwnerApproval('curriculum_resequence')).toBe(
      'pending_owner_review',
    )
    expect(resolveOwnerApproval('cross_track_refactor')).toBe(
      'pending_owner_review',
    )
  })

  it('blocks direct publish and destructive migration classes', () => {
    expect(resolveOwnerApproval('direct_publish')).toBe('blocked')
    expect(resolveOwnerApproval('destructive_migration')).toBe('blocked')
    expect(approvalStateToProposalStatus('blocked')).toBe('blocked')
  })
})
