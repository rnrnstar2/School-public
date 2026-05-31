import { schemaValidator, SchemaValidationError } from '../src/core/schema-validator.js'
import type { Lesson } from '../src/core/types.js'

describe('schemaValidator', () => {
  const validLesson: Lesson = {
    id: 'atom.mock.schema-validator',
    title: 'Schema Validator Smoke',
    persona_tags: ['web-builder'],
    goal_tags: ['validation'],
    capability_inputs: ['owner-request-normalized'],
    capability_outputs: ['validate-schema'],
    hard_prerequisites: [],
    soft_prerequisites: [],
    deliverable: {
      type: 'markdown_doc',
      validation: 'owner_local_review_v1',
    },
    evidence: ['url'],
    media_slots: [],
    freshness_sources: ['docs/schema'],
    status: 'draft',
  }

  it('accepts valid lesson schema payloads', async () => {
    const result = await schemaValidator.validateWithSchemaFile<Lesson>(
      'lesson.schema.json',
      validLesson,
    )

    expect(result.id).toBe(validLesson.id)
  })

  it('rejects invalid lesson schema payloads', async () => {
    await expect(
      schemaValidator.validateWithSchemaFile('lesson.schema.json', {
        ...validLesson,
        id: 'invalid-id',
      }),
    ).rejects.toBeInstanceOf(SchemaValidationError)
  })
})
