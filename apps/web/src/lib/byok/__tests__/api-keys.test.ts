import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  BYOK_PROVIDERS,
  decryptApiKey,
  deleteApiKey,
  encryptApiKey,
  getApiKeyForUser,
  isByokProvider,
  listApiKeysForUser,
  listAvailableProvidersForUser,
  maskApiKey,
  upsertApiKey,
} from '@/lib/byok/api-keys'

const TEST_KEY = randomBytes(32).toString('base64')
const ORIGINAL_LEGACY = process.env.BYOK_ENCRYPTION_KEY
const ORIGINAL_PRIMARY = process.env.BYOK_ENCRYPTION_KEY_PRIMARY
const ORIGINAL_PREVIOUS = process.env.BYOK_ENCRYPTION_KEY_PREVIOUS

function clearByokEnv() {
  delete process.env.BYOK_ENCRYPTION_KEY
  delete process.env.BYOK_ENCRYPTION_KEY_PRIMARY
  delete process.env.BYOK_ENCRYPTION_KEY_PREVIOUS
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

beforeEach(() => {
  clearByokEnv()
  // Default fixture: legacy single-key path. Individual rotation specs
  // override these vars explicitly.
  process.env.BYOK_ENCRYPTION_KEY = TEST_KEY
})

afterEach(() => {
  clearByokEnv()
  restoreEnv('BYOK_ENCRYPTION_KEY', ORIGINAL_LEGACY)
  restoreEnv('BYOK_ENCRYPTION_KEY_PRIMARY', ORIGINAL_PRIMARY)
  restoreEnv('BYOK_ENCRYPTION_KEY_PREVIOUS', ORIGINAL_PREVIOUS)
})

describe('BYOK provider whitelist', () => {
  it('exposes the five supported providers (W16 added xai)', () => {
    expect(BYOK_PROVIDERS).toEqual([
      'anthropic',
      'openai',
      'gemini',
      'zai',
      'xai',
    ])
  })

  it('isByokProvider gates unknown values', () => {
    expect(isByokProvider('anthropic')).toBe(true)
    expect(isByokProvider('zai')).toBe(true)
    expect(isByokProvider('xai')).toBe(true)
    expect(isByokProvider('cohere')).toBe(false)
    expect(isByokProvider('')).toBe(false)
    expect(isByokProvider(undefined)).toBe(false)
  })
})

describe('encryptApiKey / decryptApiKey', () => {
  it('round-trips the plaintext', () => {
    const plaintext = 'sk-ant-api03-this-is-a-fake-key-9876543210'
    const sealed = encryptApiKey(plaintext)
    expect(sealed).not.toContain(plaintext)
    expect(decryptApiKey(sealed)).toBe(plaintext)
  })

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const plaintext = 'sk-test-abc'
    const a = encryptApiKey(plaintext)
    const b = encryptApiKey(plaintext)
    expect(a).not.toBe(b)
    expect(decryptApiKey(a)).toBe(plaintext)
    expect(decryptApiKey(b)).toBe(plaintext)
  })

  it('throws if both BYOK_ENCRYPTION_KEY_PRIMARY and legacy are missing', () => {
    clearByokEnv()
    expect(() => encryptApiKey('x')).toThrow(
      /BYOK_ENCRYPTION_KEY_PRIMARY.*required/,
    )
  })

  it('throws if the key is the wrong length', () => {
    process.env.BYOK_ENCRYPTION_KEY = Buffer.from('too-short').toString('base64')
    expect(() => encryptApiKey('x')).toThrow(/32 bytes/)
  })

  it('rejects empty plaintext', () => {
    expect(() => encryptApiKey('')).toThrow()
  })

  it('rejects tampered ciphertexts (auth tag fails)', () => {
    const plaintext = 'sk-test-tamper'
    const sealed = encryptApiKey(plaintext)
    const buf = Buffer.from(sealed, 'base64')
    // Flip a bit in the ciphertext segment (after iv+authTag = 12+16 = 28 bytes)
    buf[28] = buf[28] ^ 0xff
    const tampered = buf.toString('base64')
    expect(() => decryptApiKey(tampered)).toThrow()
  })
})

describe('AES-256-GCM key rotation (W14)', () => {
  const PRIMARY_KEY = randomBytes(32).toString('base64')
  const PREVIOUS_KEY = randomBytes(32).toString('base64')

  it('PRIMARY のみで encrypt → 同じ PRIMARY で decrypt 成功', () => {
    clearByokEnv()
    process.env.BYOK_ENCRYPTION_KEY_PRIMARY = PRIMARY_KEY
    const plaintext = 'sk-primary-only-fixture'
    const sealed = encryptApiKey(plaintext)
    expect(decryptApiKey(sealed)).toBe(plaintext)
  })

  it('PRIMARY 暗号化の ciphertext を PREVIOUS だけでは decrypt できない (throw)', () => {
    clearByokEnv()
    process.env.BYOK_ENCRYPTION_KEY_PRIMARY = PRIMARY_KEY
    const sealed = encryptApiKey('sk-primary-encrypted')

    // Now strip PRIMARY and only have a different PREVIOUS — both keys fail.
    clearByokEnv()
    process.env.BYOK_ENCRYPTION_KEY_PRIMARY = PREVIOUS_KEY // wrong key as primary
    process.env.BYOK_ENCRYPTION_KEY_PREVIOUS = PREVIOUS_KEY
    expect(() => decryptApiKey(sealed)).toThrow(
      /neither PRIMARY nor PREVIOUS key matched/,
    )
  })

  it('rotation: 旧 PRIMARY で暗号化された row が新 PRIMARY+旧 PREVIOUS で decrypt できる', () => {
    // Phase A: encrypt with old key (legacy single-key environment)
    clearByokEnv()
    process.env.BYOK_ENCRYPTION_KEY_PRIMARY = PREVIOUS_KEY
    const plaintext = 'sk-rotated-key-fixture'
    const sealedWithOld = encryptApiKey(plaintext)

    // Phase B: deploy new dual-key env. PRIMARY is the new key, the old key
    // moves to PREVIOUS.
    clearByokEnv()
    process.env.BYOK_ENCRYPTION_KEY_PRIMARY = PRIMARY_KEY
    process.env.BYOK_ENCRYPTION_KEY_PREVIOUS = PREVIOUS_KEY

    // Old ciphertext must still decrypt via PREVIOUS.
    expect(decryptApiKey(sealedWithOld)).toBe(plaintext)

    // New writes always use PRIMARY.
    const sealedWithNew = encryptApiKey(plaintext)
    expect(sealedWithNew).not.toBe(sealedWithOld)
    expect(decryptApiKey(sealedWithNew)).toBe(plaintext)

    // After Phase 3 (PREVIOUS dropped), the old ciphertext can no longer be
    // decrypted — confirms PREVIOUS was actually doing the work above.
    delete process.env.BYOK_ENCRYPTION_KEY_PREVIOUS
    expect(() => decryptApiKey(sealedWithOld)).toThrow(
      /neither PRIMARY nor PREVIOUS key matched/,
    )
    // ...but new ciphertext keeps decrypting via PRIMARY alone.
    expect(decryptApiKey(sealedWithNew)).toBe(plaintext)
  })

  it('hard-fail: PRIMARY も PREVIOUS も legacy も未設定だと encrypt が即 throw', () => {
    clearByokEnv()
    expect(() => encryptApiKey('x')).toThrow(
      /BYOK_ENCRYPTION_KEY_PRIMARY.*required/,
    )
    expect(() => decryptApiKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toThrow(
      /BYOK_ENCRYPTION_KEY_PRIMARY.*required/,
    )
  })

  it('legacy fallback: BYOK_ENCRYPTION_KEY のみでも完全に動作する (後方互換)', () => {
    clearByokEnv()
    process.env.BYOK_ENCRYPTION_KEY = PREVIOUS_KEY // legacy single-key
    const plaintext = 'sk-legacy-mode'
    const sealed = encryptApiKey(plaintext)
    expect(decryptApiKey(sealed)).toBe(plaintext)
  })

  it('legacy is shadowed by PRIMARY: PRIMARY が立っているときは BYOK_ENCRYPTION_KEY が無視される', () => {
    clearByokEnv()
    process.env.BYOK_ENCRYPTION_KEY_PRIMARY = PRIMARY_KEY
    const sealedWithPrimary = encryptApiKey('sk-shadow')

    // Now also set legacy to a different key — must not affect anything,
    // because PRIMARY takes precedence.
    process.env.BYOK_ENCRYPTION_KEY = PREVIOUS_KEY
    expect(decryptApiKey(sealedWithPrimary)).toBe('sk-shadow')

    // Conversely, a ciphertext made with the legacy-only key must NOT decrypt
    // when PRIMARY is set to a different key (and PREVIOUS is unset),
    // demonstrating that legacy is only consulted as the PRIMARY fallback.
    clearByokEnv()
    process.env.BYOK_ENCRYPTION_KEY = PREVIOUS_KEY
    const sealedWithLegacy = encryptApiKey('sk-legacy-fixture')

    clearByokEnv()
    process.env.BYOK_ENCRYPTION_KEY_PRIMARY = PRIMARY_KEY
    // Legacy still set but PRIMARY shadows it → should fail.
    process.env.BYOK_ENCRYPTION_KEY = PREVIOUS_KEY
    expect(() => decryptApiKey(sealedWithLegacy)).toThrow()
  })
})

describe('maskApiKey', () => {
  it('masks long Anthropic-style keys with head + tail visible', () => {
    expect(maskApiKey('sk-ant-api03-abcdefghijklmnop-XYZ9')).toBe(
      'sk-ant-...***XYZ9',
    )
  })

  it('handles short strings without leaking too much', () => {
    expect(maskApiKey('short')).toBe('***hort')
    expect(maskApiKey('12345678')).toBe('***5678')
  })
})

// ── Repository helpers (Supabase client mocked) ─────────────────────

type ChainStub = {
  table?: string
  selectArgs?: string
  filters: Array<{ kind: 'eq'; column: string; value: unknown }>
  upsertPayload?: unknown
  upsertOptions?: unknown
  deleted?: boolean
  resolveValue: { data: unknown; error: unknown }
}

function makeClient(stub: {
  fromImpl: (table: string) => ChainStub
}) {
  const calls: ChainStub[] = []
  const client = {
    from: vi.fn((table: string) => {
      const ctx = stub.fromImpl(table)
      ctx.table = table
      calls.push(ctx)

      const builder: Record<string, unknown> = {}
      builder.select = vi.fn((args: string) => {
        ctx.selectArgs = args
        return builder
      })
      builder.eq = vi.fn((column: string, value: unknown) => {
        ctx.filters.push({ kind: 'eq', column, value })
        return builder
      })
      builder.upsert = vi.fn((payload: unknown, options: unknown) => {
        ctx.upsertPayload = payload
        ctx.upsertOptions = options
        return builder
      })
      builder.delete = vi.fn(() => {
        ctx.deleted = true
        return builder
      })
      builder.maybeSingle = vi.fn(() => Promise.resolve(ctx.resolveValue))
      builder.then = (
        resolve: (value: { data: unknown; error: unknown }) => void,
      ) => resolve(ctx.resolveValue)

      return builder
    }),
  }
  return { client, calls }
}

describe('getApiKeyForUser', () => {
  it('returns null when no row exists', async () => {
    const { client } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: { data: null, error: null },
      }),
    })
    const result = await getApiKeyForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'user-1',
      'anthropic',
    )
    expect(result).toBeNull()
  })

  it('returns null when userId is empty', async () => {
    const { client } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: { data: null, error: null },
      }),
    })
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await getApiKeyForUser(client as any, '', 'anthropic'),
    ).toBeNull()
  })

  it('decrypts and returns the plaintext for a stored key', async () => {
    const plaintext = 'sk-ant-api03-real-key'
    const sealed = encryptApiKey(plaintext)
    const { client, calls } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: { data: { encrypted_key: sealed }, error: null },
      }),
    })
    const result = await getApiKeyForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'user-42',
      'anthropic',
    )
    expect(result).toBe(plaintext)
    expect(calls[0].table).toBe('learner_api_keys')
    expect(calls[0].filters).toEqual([
      { kind: 'eq', column: 'user_id', value: 'user-42' },
      { kind: 'eq', column: 'provider', value: 'anthropic' },
    ])
  })

  it('returns null instead of throwing when decryption fails (key rotated, corrupt blob)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { client } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: {
          data: { encrypted_key: 'this-is-not-valid-ciphertext' },
          error: null,
        },
      }),
    })
    const result = await getApiKeyForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'user-1',
      'openai',
    )
    expect(result).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('upsertApiKey', () => {
  it('encrypts the plaintext and stores it with a masked hint', async () => {
    const { client, calls } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: { data: null, error: null },
      }),
    })
    const result = await upsertApiKey(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'user-1',
      'gemini',
      'AIzaSy-FAKE-gemini-key-1234',
    )
    expect(result).toEqual({
      ok: true,
      keyHint: 'AIzaSy-...***1234',
    })

    const payload = calls[0].upsertPayload as {
      user_id: string
      provider: string
      encrypted_key: string
      key_hint: string
    }
    expect(payload.user_id).toBe('user-1')
    expect(payload.provider).toBe('gemini')
    expect(payload.key_hint).toBe('AIzaSy-...***1234')
    // Round-trip the ciphertext to make sure it really is encrypted.
    expect(decryptApiKey(payload.encrypted_key)).toBe(
      'AIzaSy-FAKE-gemini-key-1234',
    )
    expect(calls[0].upsertOptions).toEqual({ onConflict: 'user_id,provider' })
  })

  it('rejects unknown providers', async () => {
    const { client } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: { data: null, error: null },
      }),
    })
    const result = await upsertApiKey(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'user-1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'cohere' as any,
      'key',
    )
    expect(result).toEqual({ ok: false, error: 'invalid_provider' })
  })

  it('rejects empty userId', async () => {
    const { client } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: { data: null, error: null },
      }),
    })
    const result = await upsertApiKey(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      '',
      'anthropic',
      'sk-ant-x',
    )
    expect(result).toEqual({ ok: false, error: 'unauthenticated' })
  })

  it('rejects empty plaintext', async () => {
    const { client } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: { data: null, error: null },
      }),
    })
    const result = await upsertApiKey(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'user-1',
      'anthropic',
      '   ',
    )
    expect(result).toEqual({ ok: false, error: 'empty_key' })
  })

  it('returns ok=false when the DB upsert fails', async () => {
    const { client } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: { data: null, error: { message: 'rls denied' } },
      }),
    })
    const result = await upsertApiKey(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'user-1',
      'openai',
      'sk-openai-fake',
    )
    expect(result).toEqual({ ok: false, error: 'rls denied' })
  })
})

describe('deleteApiKey', () => {
  it('issues a delete scoped to user_id + provider', async () => {
    const { client, calls } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: { data: null, error: null },
      }),
    })
    const result = await deleteApiKey(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'user-1',
      'zai',
    )
    expect(result).toEqual({ ok: true })
    expect(calls[0].deleted).toBe(true)
    expect(calls[0].filters).toEqual([
      { kind: 'eq', column: 'user_id', value: 'user-1' },
      { kind: 'eq', column: 'provider', value: 'zai' },
    ])
  })

  it('rejects invalid providers without touching the DB', async () => {
    const { client, calls } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: { data: null, error: null },
      }),
    })
    const result = await deleteApiKey(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'user-1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'unknown' as any,
    )
    expect(result).toEqual({ ok: false, error: 'invalid_provider' })
    expect(calls).toHaveLength(0)
  })
})

describe('listAvailableProvidersForUser (W16)', () => {
  it('returns just the providers the user has registered', async () => {
    const { client, calls } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: {
          data: [
            { provider: 'anthropic' },
            { provider: 'gemini' },
            { provider: 'xai' },
          ],
          error: null,
        },
      }),
    })
    const providers = await listAvailableProvidersForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'user-1',
    )
    expect(providers).toEqual(['anthropic', 'gemini', 'xai'])
    expect(calls[0].table).toBe('learner_api_keys')
    expect(calls[0].selectArgs).toBe('provider')
    expect(calls[0].filters).toEqual([
      { kind: 'eq', column: 'user_id', value: 'user-1' },
    ])
  })

  it('filters out unknown providers (defensive)', async () => {
    const { client } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: {
          data: [
            { provider: 'anthropic' },
            { provider: 'cohere' }, // unknown — must be dropped
          ],
          error: null,
        },
      }),
    })
    const providers = await listAvailableProvidersForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'user-1',
    )
    expect(providers).toEqual(['anthropic'])
  })

  it('returns [] when userId is empty', async () => {
    const { client } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: { data: [], error: null },
      }),
    })
    const providers = await listAvailableProvidersForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      '',
    )
    expect(providers).toEqual([])
  })

  it('returns [] on DB error', async () => {
    const { client } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: { data: null, error: { message: 'boom' } },
      }),
    })
    const providers = await listAvailableProvidersForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'user-1',
    )
    expect(providers).toEqual([])
  })
})

describe('listApiKeysForUser', () => {
  it('returns a normalized list, filtering out unknown providers', async () => {
    const { client } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: {
          data: [
            { provider: 'anthropic', key_hint: 'sk-ant-...***abcd', updated_at: 't1' },
            { provider: 'openai', key_hint: null, updated_at: 't2' },
            { provider: 'cohere', key_hint: 'noop', updated_at: 't3' }, // ignored
          ],
          error: null,
        },
      }),
    })
    const rows = await listApiKeysForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'user-1',
    )
    expect(rows).toEqual([
      { provider: 'anthropic', key_hint: 'sk-ant-...***abcd', updated_at: 't1' },
      { provider: 'openai', key_hint: null, updated_at: 't2' },
    ])
  })

  it('returns [] when userId is empty', async () => {
    const { client } = makeClient({
      fromImpl: () => ({
        filters: [],
        resolveValue: { data: [], error: null },
      }),
    })
    const rows = await listApiKeysForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      '',
    )
    expect(rows).toEqual([])
  })
})
