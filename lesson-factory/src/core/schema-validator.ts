import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

import type { ErrorObject, ValidateFunction } from 'ajv'

import { getSchemasDir } from './paths.js'

const require = createRequire(import.meta.url)
const Ajv2020 = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js')
const addFormats = require('ajv-formats/dist/index.js') as typeof import('ajv-formats/dist/index.js')

export interface ValidationIssue {
  instancePath: string
  message: string
}

export class SchemaValidationError extends Error {
  readonly issues: ValidationIssue[]

  constructor(schemaLabel: string, issues: ValidationIssue[]) {
    super(`Schema validation failed for ${schemaLabel}`)
    this.name = 'SchemaValidationError'
    this.issues = issues
  }
}

class SchemaValidator {
  private readonly ajv = new Ajv2020.default({
    allErrors: true,
    strict: false,
    validateSchema: false,
  })

  private initialized = false

  constructor() {
    addFormats.default(this.ajv)
  }

  async validateWithSchemaFile<T>(schemaFileName: string, data: unknown): Promise<T> {
    await this.ensureBaseSchemas()
    const schemaPath = path.join(getSchemasDir(), schemaFileName)
    const raw = await readFile(schemaPath, 'utf8')
    const schema = JSON.parse(raw) as { $id?: string }
    const validate =
      (schema.$id ? this.ajv.getSchema(schema.$id) : undefined) ?? this.ajv.compile(schema)

    if (!validate(data)) {
      throw new SchemaValidationError(schemaFileName, this.toIssues(validate.errors))
    }

    return data as T
  }

  async validateInlineSchema<T>(schemaId: string, schema: object, data: unknown): Promise<T> {
    await this.ensureBaseSchemas()

    let validate = this.ajv.getSchema(schemaId)
    if (!validate) {
      this.ajv.addSchema(schema, schemaId)
      validate = this.ajv.getSchema(schemaId)
    }

    if (!validate) {
      throw new Error(`Unable to compile schema ${schemaId}`)
    }

    if (!validate(data)) {
      throw new SchemaValidationError(schemaId, this.toIssues(validate.errors))
    }

    return data as T
  }

  private async ensureBaseSchemas(): Promise<void> {
    if (this.initialized) {
      return
    }

    const entries = await readdir(getSchemasDir(), { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue
      }

      const schemaPath = path.join(getSchemasDir(), entry.name)
      const raw = await readFile(schemaPath, 'utf8')
      const schema = JSON.parse(raw) as { $id?: string }
      if (!schema.$id || this.ajv.getSchema(schema.$id)) {
        continue
      }

      this.ajv.addSchema(schema)
    }

    this.initialized = true
  }

  private toIssues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
    if (!errors) {
      return []
    }

    return errors.map((error) => {
      return {
        instancePath: error.instancePath || '/',
        message: error.message || 'Unknown validation error',
      }
    })
  }
}

export const schemaValidator = new SchemaValidator()
