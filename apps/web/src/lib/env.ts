/**
 * Runtime environment variable validation.
 * Throws at build/startup if required vars are missing.
 */

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function isProductionRuntime(): boolean {
  // VERCEL_ENV is set by Vercel deployments to 'production' on prod builds.
  // NODE_ENV alone is unreliable because Next.js production builds in CI
  // also use 'production' before deploy verification can run.
  return (
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  )
}

export function validateEnv() {
  // Public vars (needed at build time)
  requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  // TQ-261 / W14: BYOK is keyed by `BYOK_ENCRYPTION_KEY_PRIMARY` (preferred)
  // or the legacy `BYOK_ENCRYPTION_KEY` single-key fallback. PREVIOUS is
  // optional rotation-window decrypt-only fallback (see
  // `apps/web/src/lib/byok/api-keys.ts` JSDoc + `docs/byok-key-rotation.md`).
  //
  // We surface a missing primary at startup in production so the env is set
  // before traffic hits the BYOK code path. Outside production we log a
  // warning instead of throwing — local dev may not need BYOK.
  const hasPrimary = Boolean(process.env.BYOK_ENCRYPTION_KEY_PRIMARY)
  const hasLegacy = Boolean(process.env.BYOK_ENCRYPTION_KEY)
  const hasAnyEncryptionKey = hasPrimary || hasLegacy

  if (isProductionRuntime()) {
    if (!hasAnyEncryptionKey) {
      throw new Error(
        'Missing required environment variable: BYOK_ENCRYPTION_KEY_PRIMARY (or legacy BYOK_ENCRYPTION_KEY). 32-byte base64; generate with `openssl rand -base64 32`. See docs/byok-key-rotation.md for rotation procedure.',
      )
    }
  } else if (!hasAnyEncryptionKey) {
    // eslint-disable-next-line no-console
    console.warn(
      '[env] Neither BYOK_ENCRYPTION_KEY_PRIMARY nor legacy BYOK_ENCRYPTION_KEY is set; BYOK API key decrypt/encrypt will fail at runtime. Set a 32-byte base64 key (see .env.example).',
    )
  }
}

/** Server-only env access with validation */
export const serverEnv = {
  get supabaseUrl() {
    return requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  },
  get supabaseAnonKey() {
    return requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  },
  get zaiApiUrl() {
    return process.env.ZAI_CODING_PLAN_API_URL || process.env.ZAI_PLANNER_API_URL || ''
  },
  get zaiApiKey() {
    return process.env.ZAI_PLANNER_API_KEY || process.env.ZAI_API_KEY || ''
  },
  get zaiModel() {
    return process.env.ZAI_PLANNER_MODEL || 'glm-5'
  },
  /**
   * Optional fallback flag.
   * When `MENTOR_FAST_INTAKE_FALLBACK=1`, the legacy regex-based fast intake
   * hearing path is allowed to short-circuit Live AI (GLM-5/ZAI) when the
   * caller passes `preferFastIntake: true`.
   * Default: undefined → Live AI is the canonical hearing path (TQ-210).
   */
  get mentorFastIntakeFallback() {
    return process.env.MENTOR_FAST_INTAKE_FALLBACK === '1'
  },
  /**
   * Multi-Provider Mentor Router kill-switch (TQ-227).
   * `MENTOR_MODEL_FALLBACK_ALL_GLM=1` で `pickModelFor` が全 role を
   * GLM-5.1 (ZAI) に倒す。Anthropic / OpenAI / Gemini が同時障害した際の
   * 緊急退避経路として使用する。
   */
  get mentorModelFallbackAllGlm() {
    return process.env.MENTOR_MODEL_FALLBACK_ALL_GLM === '1'
  },
  /**
   * Mentor Conductor feature flag (TQ-228 Phase γ → TQ-243 default-ON).
   *
   * Conductor は hearing → goal_nodes → compiled_plans を
   * `apps/web/src/lib/mentor/conductor.ts` の state machine 経由で実行する。
   *
   * TQ-243 (2026-05-09 owner Q4 確定): Phase 1 完了直後 (本 TQ) から
   * **production default ON** に切り替え。production 環境では env が
   * 未設定でも Conductor 経路を使う。明示 OFF にしたい場合は
   * `MENTOR_CONDUCTOR_ENABLED=0` を設定する。
   *
   * 非 production (local dev / preview) は引き続き **default OFF**。
   * 既存 path を保ったまま `=1` でだけ Conductor を試せる。
   *
   * 値の解釈:
   *   - `=1`: 強制 ON
   *   - `=0`: 強制 OFF
   *   - 未設定 / その他: production なら ON、それ以外は OFF
   */
  get mentorConductorEnabled() {
    const raw = process.env.MENTOR_CONDUCTOR_ENABLED
    if (raw === '1') return true
    if (raw === '0') return false
    return isProductionRuntime()
  },
  /**
   * Mentor Provider Phase 3 opt-in flag (TQ-245).
   * `MENTOR_PROVIDER_PHASE3=1` で sub-agent が `dispatchProviderCall` 経由で
   * Anthropic / OpenAI / Gemini SDK を **実呼び出し** する経路に乗る。
   *
   * Default (`undefined` / その他) は false で、各 sub-agent は既存 mock /
   * heuristic / ZAI fetch path を維持する（Phase 1 互換、Owner Q5 で
   * 学習者口座保護のため実 traffic は ZAI 強制）。
   *
   * Phase 3 で実 API + per-user budget cap を有効化する判断は Owner マターで、
   * PR ベースで env を設定する（本 flag は skeleton 配線のみ提供）。
   */
  get mentorProviderPhase3() {
    return process.env.MENTOR_PROVIDER_PHASE3 === '1'
  },
  /**
   * Per-role Mentor Router override (TQ-227).
   * `MENTOR_MODEL_<ROLE>=provider:model` または `MENTOR_MODEL_<ROLE>=model`
   * で role 単位の model 指定を許可する（コスト削減 / 実験用）。
   * 詳細は `apps/web/src/lib/mentor/router.ts` の `pickModelFor` 参照。
   */
  get mentorModelOverrides() {
    return {
      conductor: process.env.MENTOR_MODEL_CONDUCTOR,
      goalTree: process.env.MENTOR_MODEL_GOAL_TREE,
      techScout: process.env.MENTOR_MODEL_TECH_SCOUT,
      toolScout: process.env.MENTOR_MODEL_TOOL_SCOUT,
      // W16: trend_scout (X / Grok preferred for social-trend / realtime-x)
      trendScout: process.env.MENTOR_MODEL_TREND_SCOUT,
      nonEngCritic: process.env.MENTOR_MODEL_NON_ENG_CRITIC,
      pathPlanner: process.env.MENTOR_MODEL_PATH_PLANNER,
      lessonMatcher: process.env.MENTOR_MODEL_LESSON_MATCHER,
      memoryRecall: process.env.MENTOR_MODEL_MEMORY_RECALL,
      judge: process.env.MENTOR_MODEL_JUDGE,
      tieBreaker: process.env.MENTOR_MODEL_TIE_BREAKER,
    }
  },
}
