// TQ-213: P-ENG-PROTOTYPE 一次ペルソナ向けに `app` を MVP 対応 domain として追加。
// `app` 配下の atom catalog は未整備のため、暫定で web-builder anchor を流用する
// (`plan-compiler.ts` の DEFAULT_PERSONAS_BY_DOMAIN を参照)。
// 本格対応は TQ-217 (anchor 解体) / TQ-218 (no-code-first atom 整備) で行う予定。
export const MVP_ENABLED_DOMAINS = ['web', 'app'] as const

export const MVP_COMING_SOON_MESSAGE =
  '準備中: 現在 MVP 期間のため Web 制作 / アプリ制作のみ対応'

export type MvpEnabledDomain = (typeof MVP_ENABLED_DOMAINS)[number]

export function isMvpEnabledDomainSlug(domainSlug: string): domainSlug is MvpEnabledDomain {
  return (MVP_ENABLED_DOMAINS as readonly string[]).includes(domainSlug)
}

export function filterMvpEnabledDomainSlugs(domainSlugs: string[]): MvpEnabledDomain[] {
  return domainSlugs.filter(isMvpEnabledDomainSlug)
}
