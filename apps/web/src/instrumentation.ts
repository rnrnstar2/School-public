import * as Sentry from '@sentry/nextjs'

import { validateEnv } from './lib/env'

/**
 * Next.js bootstrap hook.
 *
 * W44 (2026-05-09 / Wave 11 deploy gate fix): `validateEnv()` was previously
 * defined in `src/lib/env.ts` but never invoked anywhere in the repo, so the
 * BYOK_ENCRYPTION_KEY gate was a paper contract that did not actually fire at
 * production startup. We now call it once here so the validation runs exactly
 * once per node/edge runtime boot.
 *
 * Failure policy:
 *   - Production runtime is NOT halted on a missing key. We log the error to
 *     Sentry + console so the issue is surfaced in observability, but we do
 *     not `process.exit(1)` because that would convert a single missing env
 *     var into a 503 storm for the entire deployment. The downstream code
 *     paths that need the key (BYOK encrypt/decrypt) still throw on use, so
 *     traffic that does not exercise BYOK keeps serving.
 *   - Non-production: the existing `validateEnv()` body already logs a warn
 *     and returns, so this hook just lets it run.
 */
export async function register() {
  try {
    validateEnv()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      '[instrumentation] validateEnv() failed at startup:',
      error instanceof Error ? error.message : String(error),
    )
    try {
      Sentry.captureException(error, {
        tags: { stage: 'instrumentation_register', check: 'validateEnv' },
      })
    } catch {
      // Sentry may not be initialised yet (sentry.server.config is imported
      // below). Swallow so we never block the bootstrap on observability.
    }
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
