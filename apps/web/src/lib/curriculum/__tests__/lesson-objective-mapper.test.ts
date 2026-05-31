import { describe, expect, it } from 'vitest'

import { mapLessonTagsToCapabilities } from '../lesson-objective-mapper'

describe('mapLessonTagsToCapabilities', () => {
  it('maps known web lesson tags to canonical capability slugs', () => {
    expect(
      mapLessonTagsToCapabilities(
        ['tooling-setup', 'vercel', 'auth-basics', 'データ設計', 'database_write'],
        'web',
      ),
    ).toEqual([
      'tooling-setup',
      'vercel-deploy',
      'auth-basics',
      'database-modeling',
      'supabase-setup',
    ])
  })

  it('deduplicates repeated and synonymous tags', () => {
    expect(
      mapLessonTagsToCapabilities(
        ['deploy-site', 'vercel', 'tooling-setup', 'tooling-setup'],
        'web',
      ),
    ).toEqual(['vercel-deploy', 'tooling-setup'])
  })

  it('ignores unknown tags', () => {
    expect(
      mapLessonTagsToCapabilities(['unknown-tag', 'totally-custom', 'seo-basics'], 'web'),
    ).toEqual(['seo-basics'])
  })
})
