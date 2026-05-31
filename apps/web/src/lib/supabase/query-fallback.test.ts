import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSupabaseErrorMessage,
  isMissingSupabaseColumnError,
  isMissingSupabaseTableError,
  isSupabaseRelationshipCacheError,
} from './query-fallback'

test('getSupabaseErrorMessage joins message, details, and hint', () => {
  assert.equal(
    getSupabaseErrorMessage({
      message: 'Could not find the table',
      details: 'public.plans',
      hint: 'Verify the migration',
    }),
    'Could not find the table public.plans Verify the migration'
  )
})

test('isMissingSupabaseTableError matches PostgREST schema cache errors', () => {
  assert.equal(
    isMissingSupabaseTableError(
      {
        message: "Could not find the table 'public.plans' in the schema cache",
      },
      'plans',
    ),
    true
  )
})

test('isMissingSupabaseColumnError matches missing column errors', () => {
  assert.equal(
    isMissingSupabaseColumnError(
      {
        message: "Could not find the 'version' column of 'plans' in the schema cache",
      },
      'version',
      'plans',
    ),
    true
  )
})

test('isSupabaseRelationshipCacheError matches missing relationship errors', () => {
  assert.equal(
    isSupabaseRelationshipCacheError(
      {
        message:
          "Could not find a relationship between 'milestone_lessons' and 'lessons' in the schema cache",
      },
      'milestone_lessons',
      'lessons',
    ),
    true
  )
})
