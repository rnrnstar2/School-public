/**
 * RLS live-DB test helpers.
 *
 * These helpers connect to a LOCAL Supabase instance (started via
 * `supabase start` inside `apps/web/supabase`) and let tests exercise RLS
 * policies against the real database rather than asserting on migration SQL
 * text.
 *
 * ### Opt-in gating
 *
 * Tests that use these helpers MUST gate themselves behind `shouldRunLiveRls()`.
 * They are only executed when `RUN_LIVE_RLS_TESTS=1` is set AND the helper is
 * able to confirm connectivity to the local Supabase instance. Otherwise
 * `describe.skip`/`it.skip` is used so `pnpm test` and `pnpm test:vitest`
 * remain green in environments without a running database.
 *
 * ### Usage pattern
 *
 * ```ts
 * import { createRlsLiveContext, shouldRunLiveRls } from './rls-live-helpers'
 *
 * const runLive = shouldRunLiveRls()
 * const d = runLive ? describe : describe.skip
 *
 * d('compiled_plans RLS (live)', () => {
 *   const ctx = createRlsLiveContext()
 *   beforeAll(ctx.setup)
 *   afterAll(ctx.teardown)
 *   afterEach(ctx.cleanup)
 *
 *   it('user B cannot read user A rows', async () => {
 *     const a = await ctx.asNewUser()
 *     const b = await ctx.asNewUser()
 *     await ctx.seedRow('compiled_plans', { user_id: a.userId, goal: 'demo', steps: [] })
 *     const { data } = await b.client.from('compiled_plans').select('*')
 *     expect(data ?? []).toEqual([])
 *   })
 * })
 * ```
 */

import { createHmac, randomUUID } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve the local Supabase URL. The local dev stack (see
 * `apps/web/supabase/config.toml`) exposes the API on port 54341.
 */
function resolveSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    'http://127.0.0.1:54341'
  )
}

/**
 * Resolve a service-role key. The default here matches the well-known
 * `supabase start` local service_role JWT — it is ONLY valid against local
 * instances and has no effect on production.
 *
 * Local default taken from `supabase status` / Supabase CLI docs. If the CLI
 * rotates the signing secret, override with SUPABASE_SERVICE_ROLE_KEY.
 */
function resolveServiceRoleKey(): string | null {
  const fromEnv =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
  if (fromEnv) return fromEnv

  // Well-known local-dev default emitted by `supabase start`. Safe to commit:
  // this JWT only validates against the CLI's ephemeral local stack.
  // If missing, tests will fail fast at connectivity check and skip.
  return (
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.' +
    'EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  )
}

function resolveAnonKey(): string | null {
  const fromEnv =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (fromEnv) return fromEnv
  // Well-known local-dev anon JWT, same origin story as the service-role key.
  return (
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.' +
    'CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  )
}

function resolveJwtSecret(): string {
  return process.env.JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'
}

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function signLocalAccessToken(params: {
  appMetadata?: Record<string, unknown>
  email: string
  userId: string
  userMetadata?: Record<string, unknown>
}): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: 'supabase-demo',
    aud: 'authenticated',
    exp: now + 60 * 60,
    iat: now,
    sub: params.userId,
    email: params.email,
    phone: '',
    role: 'authenticated',
    aal: 'aal1',
    session_id: randomUUID(),
    app_metadata: params.appMetadata ?? {},
    user_metadata: params.userMetadata ?? {},
  }
  const encodedHeader = toBase64Url(JSON.stringify(header))
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = createHmac('sha256', resolveJwtSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest()

  return `${encodedHeader}.${encodedPayload}.${toBase64Url(signature)}`
}

/**
 * `shouldRunLiveRls()` returns true only if the caller opted in via
 * RUN_LIVE_RLS_TESTS=1. Connectivity to the local Supabase is attempted on
 * setup; if it fails the tests are skipped at runtime.
 */
export function shouldRunLiveRls(): boolean {
  return process.env.RUN_LIVE_RLS_TESTS === '1'
}

/**
 * Lazily ping the local Supabase REST endpoint to confirm it is up.
 * Returns true if reachable, false otherwise. Never throws.
 */
export async function isLocalSupabaseReachable(): Promise<boolean> {
  try {
    const url = resolveSupabaseUrl()
    const res = await fetch(`${url}/rest/v1/`, {
      method: 'GET',
      headers: { apikey: resolveAnonKey() ?? '' },
      // `AbortSignal.timeout` is available in Node 18+.
      signal: AbortSignal.timeout(2000),
    })
    // Any HTTP response (even 401) means the endpoint exists.
    return res.status < 600
  } catch {
    return false
  }
}

export interface LiveUser {
  userId: string
  email: string
  client: SupabaseClient
  accessToken: string
}

export interface NewLiveUserOptions {
  appMetadata?: Record<string, unknown>
  userMetadata?: Record<string, unknown>
}

export interface SeededRow {
  table: string
  pkColumn: string
  pkValue: string
}

export interface RlsLiveContext {
  /** Service-role client that bypasses RLS — used for setup/teardown. */
  readonly serviceClient: SupabaseClient
  /**
   * One-time initialization: verifies connectivity. Throws if the env was
   * opted in but local Supabase is unreachable, so failures are visible
   * instead of silently passing.
   */
  setup(): Promise<void>
  /** Create a new auth user and return an authenticated client for them. */
  asNewUser(options?: NewLiveUserOptions): Promise<LiveUser>
  /**
   * Insert a row via the service client (bypassing RLS) and register it for
   * cleanup. Returns the inserted row as an opaque `Record<string, unknown>` —
   * callers can cast to their expected shape.
   */
  seedRow(
    table: string,
    row: Record<string, unknown>,
    pkColumn?: string,
  ): Promise<Record<string, unknown>>
  /** Delete every seeded row and created user since the last cleanup. */
  cleanup(): Promise<void>
  /** Global teardown — tears down any still-live fixtures. */
  teardown(): Promise<void>
}

/**
 * Create a live RLS test context. Intended to be used once per describe block.
 */
export function createRlsLiveContext(): RlsLiveContext {
  const url = resolveSupabaseUrl()
  const serviceKey = resolveServiceRoleKey()
  const anonKey = resolveAnonKey()

  if (!serviceKey || !anonKey) {
    throw new Error(
      'RLS live helpers: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY must be resolvable. ' +
        'Set them in your env or run against local `supabase start`.',
    )
  }

  const serviceClient: SupabaseClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const seededRows: SeededRow[] = []
  const createdUserIds: string[] = []

  return {
    serviceClient,

    async setup() {
      const reachable = await isLocalSupabaseReachable()
      if (!reachable) {
        throw new Error(
          `RLS live tests opted in (RUN_LIVE_RLS_TESTS=1) but local Supabase at ${url} is not reachable. ` +
            'Start it with `cd apps/web/supabase && supabase start`, or unset RUN_LIVE_RLS_TESTS.',
        )
      }
    },

    async asNewUser(options: NewLiveUserOptions = {}): Promise<LiveUser> {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const email = `rls-live+${suffix}@example.test`
      const password = `Pw!${suffix}-${Math.random().toString(36).slice(2, 10)}`
      const fallbackClient = () => {
        const userId = randomUUID()
        const accessToken = signLocalAccessToken({
          userId,
          email,
          appMetadata: options.appMetadata,
          userMetadata: options.userMetadata,
        })
        const client = createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        })

        return { userId, email, client, accessToken }
      }

      // Create the user via the admin API so email confirmation is skipped.
      const { data: created, error: createErr } =
        await serviceClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: options.appMetadata,
          user_metadata: options.userMetadata,
        })
      if (createErr || !created.user) {
        // Older local `supabase db reset` flows can leave auth without
        // `auth.identities`, which breaks admin user creation. For RLS tests we
        // only need a valid JWT payload, so fall back to a locally signed token.
        return fallbackClient()
      }
      const userId = created.user.id
      createdUserIds.push(userId)

      // Sign in to obtain an access token / authenticated client.
      const authClient = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data: signed, error: signInErr } =
        await authClient.auth.signInWithPassword({ email, password })
      if (signInErr || !signed.session) {
        return fallbackClient()
      }

      const accessToken = signed.session.access_token
      const client = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      })

      return { userId, email, client, accessToken }
    },

    async seedRow(
      table: string,
      row: Record<string, unknown>,
      pkColumn = 'id',
    ): Promise<Record<string, unknown>> {
      const { data, error } = await serviceClient
        .from(table)
        .insert(row)
        .select('*')
        .single()
      if (error || !data) {
        throw new Error(
          `seedRow(${table}): ${error?.message ?? 'no row returned'}`,
        )
      }
      const rowData = data as Record<string, unknown>
      const pkValue = rowData[pkColumn]
      if (typeof pkValue !== 'string') {
        throw new Error(
          `seedRow(${table}): pkColumn "${pkColumn}" missing on returned row`,
        )
      }
      seededRows.push({ table, pkColumn, pkValue })
      return rowData
    },

    async cleanup() {
      // Drain in reverse insertion order to respect FK dependencies.
      while (seededRows.length > 0) {
        const seed = seededRows.pop()!
        await serviceClient
          .from(seed.table)
          .delete()
          .eq(seed.pkColumn, seed.pkValue)
      }
      while (createdUserIds.length > 0) {
        const userId = createdUserIds.pop()!
        await serviceClient.auth.admin.deleteUser(userId)
      }
    },

    async teardown() {
      await this.cleanup()
    },
  }
}
