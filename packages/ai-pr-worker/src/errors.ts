import type { WorkerRunStatus } from './schema.js'

export interface WorkerExitDetails {
  runId?: string
  status?: WorkerRunStatus
}

export class WorkerExitError extends Error {
  readonly exitCode: number
  readonly details: WorkerExitDetails

  constructor(message: string, exitCode: number, details: WorkerExitDetails = {}) {
    super(message)
    this.name = 'WorkerExitError'
    this.exitCode = exitCode
    this.details = details
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'Unknown error'
}
