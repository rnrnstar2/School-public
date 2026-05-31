/**
 * BYOK (Bring Your Own Key) API key helper — TQ-226 / TQ-261 / W14 / W16
 *
 * Encrypts learner-supplied provider API keys (Anthropic / OpenAI / Gemini /
 * ZAI / xAI) at the application layer with AES-256-GCM and stores them in the
 * `learner_api_keys` table so the Conductor / sub-agent fan-out (TQ-227+) can
 * route requests on behalf of the user.
 *
 * W16: 'xai' added to support adaptive multi-model routing — see
 * `apps/web/src/lib/mentor/router.ts` (`PROVIDER_STRENGTHS`,
 * `ROLE_PREFERRED_PROVIDERS`).
 *
 * Encryption choice: AES-256-GCM via Node `crypto`, keyed by env-supplied
 * 32-byte base64 keys. This avoids depending on Supabase Vault / pgsodium,
 * which require project-tier-specific setup and complicate local
 * `supabase db reset` flows. The DB only ever sees the sealed ciphertext
 * bundle (`iv | authTag | ciphertext`, base64).
 *
 * RLS guarantees the row is only readable / writable by the owning user, so
 * even with the key the only blast radius from a leaked DB dump is the
 * encrypted payload — useless without the encryption key.
 *
 * ── Key precedence (W14 dual-key rotation) ─────────────────────────────────
 *
 *   1. `BYOK_ENCRYPTION_KEY_PRIMARY`  — used for **encrypt + decrypt**
 *   2. `BYOK_ENCRYPTION_KEY_PREVIOUS` — used for **decrypt only** (optional;
 *                                      lets in-flight ciphertexts created
 *                                      with the old key keep decrypting
 *                                      while new writes adopt PRIMARY).
 *   3. `BYOK_ENCRYPTION_KEY`          — legacy single-key fallback. Honored
 *                                      **only when PRIMARY is unset**, so
 *                                      pre-rotation deployments keep working
 *                                      without env churn. Once PRIMARY is
 *                                      set, the legacy var is ignored.
 *
 * If neither PRIMARY nor legacy is set, the loader throws on first use.
 * `validateEnv()` (`apps/web/src/lib/env.ts`) hoists this check to startup
 * so production cannot boot without a key configured.
 *
 * Encryption always uses the **primary** key. Decryption tries primary first,
 * then falls back to previous; if both fail we throw so the caller can
 * gracefully prompt re-entry. Trying primary first means rotation completion
 * (i.e. dropping PREVIOUS once all rows are re-encrypted) is a no-op safety-
 * wise — we never accidentally decrypt with a stale key when the primary is
 * able to.
 *
 * ── Rotation runbook ───────────────────────────────────────────────────────
 *
 * See `docs/byok-key-rotation.md`. Summary:
 *
 *   1. Generate a fresh key (`openssl rand -base64 32`).
 *   2. Set the **current** key as `BYOK_ENCRYPTION_KEY_PREVIOUS`.
 *   3. Set the **new** key as `BYOK_ENCRYPTION_KEY_PRIMARY`.
 *   4. Deploy. Existing rows continue to decrypt via PREVIOUS, new writes
 *      adopt PRIMARY.
 *   5. Run a one-shot re-encrypt script (out of scope for this PR — separate
 *      operational TQ) that walks `learner_api_keys`, decrypts each row, and
 *      re-encrypts with PRIMARY.
 *   6. Once all rows are re-encrypted, **unset** `BYOK_ENCRYPTION_KEY_PREVIOUS`
 *      and remove the legacy `BYOK_ENCRYPTION_KEY` var.
 *
 * Audit:
 *   - log every rotation attempt to `agent_runs` / Sentry with operator
 *     identity, learner row count, and old/new key hint (last 4 of base64).
 *   - never log the keys themselves.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export const BYOK_PROVIDERS = [
  'anthropic',
  'openai',
  'gemini',
  'zai',
  'xai',
] as const
export type ByokProvider = (typeof BYOK_PROVIDERS)[number]

export function isByokProvider(value: unknown): value is ByokProvider {
  return (
    typeof value === 'string' &&
    (BYOK_PROVIDERS as readonly string[]).includes(value)
  )
}

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM standard
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32 // 256 bits

type Client = SupabaseClient<Database>

export type LearnerApiKeyRow = {
  provider: ByokProvider
  key_hint: string | null
  updated_at: string
}

// ── Encryption primitives ───────────────────────────────────────────

const PRIMARY_ENV = 'BYOK_ENCRYPTION_KEY_PRIMARY'
const PREVIOUS_ENV = 'BYOK_ENCRYPTION_KEY_PREVIOUS'
const LEGACY_ENV = 'BYOK_ENCRYPTION_KEY'

/**
 * Decode a base64 32-byte key from the env var named `envName`. Returns null
 * when the env var is unset (caller decides whether that is fatal). Throws
 * with a descriptive message when the value is malformed.
 */
function decodeKey(envName: string, raw: string | undefined): Buffer | null {
  if (!raw) return null
  let key: Buffer
  try {
    key = Buffer.from(raw, 'base64')
  } catch {
    throw new Error(`${envName} must be base64-encoded.`)
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `${envName} must decode to exactly ${KEY_LENGTH} bytes (got ${key.length}).`,
    )
  }
  return key
}

type ResolvedKeys = {
  /** Used for both encryption and decryption. */
  primary: Buffer
  /** Decryption-only fallback when primary fails. Optional. */
  previous: Buffer | null
}

/**
 * Resolve encryption keys from env. Precedence:
 *
 *   PRIMARY = BYOK_ENCRYPTION_KEY_PRIMARY ?? BYOK_ENCRYPTION_KEY (legacy)
 *   PREVIOUS = BYOK_ENCRYPTION_KEY_PREVIOUS (optional)
 *
 * Hard-fails when neither PRIMARY nor legacy is set. Read on every call (no
 * module-level cache) so that env mutations in tests / runtime flag flips
 * (e.g. mid-rotation deploys) take effect immediately without a process
 * restart.
 */
function loadKeys(): ResolvedKeys {
  const primary =
    decodeKey(PRIMARY_ENV, process.env[PRIMARY_ENV]) ??
    decodeKey(LEGACY_ENV, process.env[LEGACY_ENV])
  if (!primary) {
    throw new Error(
      `${PRIMARY_ENV} (or legacy ${LEGACY_ENV}) is required. Provide a 32-byte base64 key in the environment.`,
    )
  }
  const previous = decodeKey(PREVIOUS_ENV, process.env[PREVIOUS_ENV])
  return { primary, previous }
}

/**
 * Encrypt a plaintext API key into a sealed bundle suitable for DB storage.
 * Format: base64(iv ‖ authTag ‖ ciphertext). Always uses the PRIMARY key —
 * PREVIOUS is decrypt-only.
 */
export function encryptApiKey(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('plaintext must be a non-empty string')
  }
  const { primary } = loadKeys()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, primary, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64')
}

/**
 * Try to decrypt a sealed bundle with `key`. Returns the plaintext on
 * success, `null` on auth-tag failure (which simply means "wrong key").
 * Other malformed-input errors propagate via `null` here — the caller
 * (`decryptApiKey`) decides whether to throw a final error after exhausting
 * the candidate keys.
 */
function tryDecrypt(
  key: Buffer,
  iv: Buffer,
  authTag: Buffer,
  ciphertext: Buffer,
): string | null {
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}

/**
 * Decrypt a sealed bundle previously produced by `encryptApiKey`. Tries the
 * PRIMARY key first, then falls back to PREVIOUS if PRIMARY auth-tag check
 * fails — this is what makes graceful key rotation possible. Throws when
 * neither key can decrypt the bundle (or when the bundle is structurally
 * malformed).
 */
export function decryptApiKey(sealed: string): string {
  if (typeof sealed !== 'string' || sealed.length === 0) {
    throw new Error('sealed bundle must be a non-empty string')
  }
  const { primary, previous } = loadKeys()
  const buf = Buffer.from(sealed, 'base64')
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('sealed bundle is too short')
  }
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const viaPrimary = tryDecrypt(primary, iv, authTag, ciphertext)
  if (viaPrimary !== null) return viaPrimary

  if (previous) {
    const viaPrevious = tryDecrypt(previous, iv, authTag, ciphertext)
    if (viaPrevious !== null) return viaPrevious
  }

  throw new Error(
    'Failed to decrypt BYOK ciphertext: neither PRIMARY nor PREVIOUS key matched (auth tag mismatch).',
  )
}

/**
 * Build a masked hint for UI display — first 7 + last 4 characters with the
 * middle replaced by ★. Never round-trips through the DB without going
 * through this helper. Examples:
 *   sk-ant-api03-abcdefg...xyz9 → sk-ant-...***xyz9
 *   short                       → ***hort
 */
export function maskApiKey(plaintext: string): string {
  const trimmed = plaintext.trim()
  if (trimmed.length <= 8) {
    return `***${trimmed.slice(-4)}`
  }
  const head = trimmed.slice(0, 7)
  const tail = trimmed.slice(-4)
  return `${head}...***${tail}`
}

// ── Repository helpers ──────────────────────────────────────────────

/**
 * Fetch and decrypt the API key for a given user / provider. Returns null if
 * the user has not registered a key for that provider.
 *
 * Used by Conductor / sub-agent code paths (TQ-227+). MUST be called with a
 * service-role or RLS-authenticated client that scopes to the user.
 */
export async function getApiKeyForUser(
  client: Client,
  userId: string,
  provider: ByokProvider,
): Promise<string | null> {
  if (!userId || !isByokProvider(provider)) {
    return null
  }
  const { data, error } = await client
    .from('learner_api_keys')
    .select('encrypted_key')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()

  if (error || !data?.encrypted_key) {
    return null
  }

  try {
    return decryptApiKey(data.encrypted_key)
  } catch (err) {
    console.warn('[byok] Failed to decrypt api key', {
      provider,
      message: err instanceof Error ? err.message : 'unknown',
    })
    return null
  }
}

/**
 * Insert or update the user's API key for a provider. Encrypts before write
 * and computes the masked hint for UI display.
 */
export async function upsertApiKey(
  client: Client,
  userId: string,
  provider: ByokProvider,
  plaintext: string,
): Promise<{ ok: true; keyHint: string } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'unauthenticated' }
  if (!isByokProvider(provider)) {
    return { ok: false, error: 'invalid_provider' }
  }
  const trimmed = plaintext.trim()
  if (!trimmed) {
    return { ok: false, error: 'empty_key' }
  }

  let encrypted: string
  let keyHint: string
  try {
    encrypted = encryptApiKey(trimmed)
    keyHint = maskApiKey(trimmed)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'encryption_failed',
    }
  }

  const { error } = await client
    .from('learner_api_keys')
    .upsert(
      {
        user_id: userId,
        provider,
        encrypted_key: encrypted,
        key_hint: keyHint,
      },
      { onConflict: 'user_id,provider' },
    )

  if (error) {
    return { ok: false, error: error.message }
  }
  return { ok: true, keyHint }
}

/**
 * Delete a user's API key for the given provider. Idempotent.
 */
export async function deleteApiKey(
  client: Client,
  userId: string,
  provider: ByokProvider,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'unauthenticated' }
  if (!isByokProvider(provider)) {
    return { ok: false, error: 'invalid_provider' }
  }
  const { error } = await client
    .from('learner_api_keys')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider)

  if (error) {
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/**
 * List the user's registered providers (without decrypting). Returns rows
 * keyed by provider so the UI can show 設定済み / 未設定 plus a masked hint.
 */
export async function listApiKeysForUser(
  client: Client,
  userId: string,
): Promise<LearnerApiKeyRow[]> {
  if (!userId) return []
  const { data, error } = await client
    .from('learner_api_keys')
    .select('provider, key_hint, updated_at')
    .eq('user_id', userId)

  if (error || !data) return []

  return data
    .filter((row): row is { provider: string; key_hint: string | null; updated_at: string } =>
      isByokProvider(row.provider),
    )
    .map((row) => ({
      provider: row.provider as ByokProvider,
      key_hint: row.key_hint,
      updated_at: row.updated_at,
    }))
}

/**
 * Return just the set of providers the user has registered a key for, in
 * insertion order. Used by adaptive routing (W16) so the Conductor can pick
 * the role-preferred provider that the learner actually has credentials for.
 *
 * Distinct from `listApiKeysForUser` which surfaces hint metadata for the UI;
 * this one is pure routing input — kept lightweight on purpose.
 *
 * Returns `[]` on missing userId or DB error so callers can degrade to the
 * default routing table without surfacing infra errors to the UX.
 */
export async function listAvailableProvidersForUser(
  client: Client,
  userId: string,
): Promise<ByokProvider[]> {
  if (!userId) return []
  const { data, error } = await client
    .from('learner_api_keys')
    .select('provider')
    .eq('user_id', userId)

  if (error || !data) return []

  return data
    .map((row) => row.provider)
    .filter((p): p is ByokProvider => isByokProvider(p))
}
