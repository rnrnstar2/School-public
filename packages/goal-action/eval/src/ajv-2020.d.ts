declare module 'ajv/dist/2020.js' {
  import type { ErrorObject, ValidateFunction } from 'ajv'

  export default class Ajv2020 {
    constructor(options?: Record<string, unknown>)
    addSchema(schema: unknown, key?: string): void
    compile(schema: unknown): ValidateFunction<unknown>
    errors?: ErrorObject[] | null
  }
}
