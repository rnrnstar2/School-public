import { describe, expect, it } from 'vitest'
import { buildCanonicalLessonSlugVariants } from '@/lib/supabase/lesson-catalog'

describe('lesson ID contract', () => {
  it('normalizes hyphen and underscore slug variants into the canonical search set', () => {
    const variants = buildCanonicalLessonSlugVariants('Lesson-Web_Builder-050_Create_Next_App')

    expect(variants).toContain('lesson-web-builder-050-create-next-app')
    expect(variants).toContain('lesson_web_builder_050_create_next_app')
  })
})
