import type { AtomRecord } from './atom-repository'

export type AtomDomainSlug = 'web' | 'automation' | 'content' | 'app'

const TRACK_ID_TO_DOMAIN: Record<string, AtomDomainSlug> = {
  'web-builder-ai': 'web',
  'ai-automation': 'automation',
  'ai-content-creator': 'content',
  'ai-app-builder': 'app',
}

function toString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function buildAtomSlugVariants(value: string): string[] {
  const normalized = value.trim().toLowerCase()

  if (!normalized) {
    return []
  }

  const hyphenated = normalized.replace(/[\s_]+/g, '-')
  const underscored = normalized.replace(/[\s-]+/g, '_')

  return Array.from(new Set([normalized, hyphenated, underscored]))
}

export function mapTrackIdToDomainSlug(trackId: string | null | undefined): AtomDomainSlug | null {
  if (!trackId) {
    return null
  }

  return TRACK_ID_TO_DOMAIN[trackId.trim()] ?? null
}

export function inferAtomDomainSlug(atom: Pick<AtomRecord, 'atomId' | 'personaTags' | 'goalTags' | 'metadata' | 'yamlContent'>): AtomDomainSlug | null {
  const metadataDomain =
    toString(atom.metadata.domain_slug) ||
    toString(atom.metadata.domain) ||
    toString(atom.yamlContent.domain_slug) ||
    toString(atom.yamlContent.domain)

  if (metadataDomain === 'web' || metadataDomain === 'automation' || metadataDomain === 'content' || metadataDomain === 'app') {
    return metadataDomain
  }

  const tokens = [
    atom.atomId.toLowerCase(),
    ...atom.personaTags.map((tag) => tag.toLowerCase()),
    ...atom.goalTags.map((tag) => tag.toLowerCase()),
    ...readStringArray(atom.metadata.domain_slugs).map((tag) => tag.toLowerCase()),
  ]

  if (tokens.some((token) => token.includes('web-builder') || token === 'website-launch' || token.includes('website'))) {
    return 'web'
  }

  if (tokens.some((token) => token.includes('automation') || token.includes('automator'))) {
    return 'automation'
  }

  if (tokens.some((token) => token.includes('content'))) {
    return 'content'
  }

  if (tokens.some((token) => token.includes('app-builder') || token.includes('crm-builder') || token.includes('meal-planner') || token.includes('app-launch'))) {
    return 'app'
  }

  return null
}

export function resolveAtomSlug(atom: Pick<AtomRecord, 'atomId' | 'metadata' | 'yamlContent'>) {
  const explicitSlug =
    toString(atom.metadata.slug) ||
    toString(atom.yamlContent.slug)

  return explicitSlug || atom.atomId
}

export function resolveAtomLegacyLessonId(atom: Pick<AtomRecord, 'metadata' | 'yamlContent'>) {
  return (
    toString(atom.metadata.legacy_lesson_id) ||
    toString(atom.metadata.source_lesson_id) ||
    toString(atom.yamlContent.legacy_lesson_id) ||
    toString(atom.yamlContent.source_lesson_id) ||
    null
  )
}

export function buildAtomAliases(atom: Pick<AtomRecord, 'atomId' | 'metadata' | 'yamlContent'>) {
  const aliases = new Set<string>()
  const slug = resolveAtomSlug(atom)
  const legacyLessonId = resolveAtomLegacyLessonId(atom)

  aliases.add(atom.atomId)

  for (const variant of buildAtomSlugVariants(atom.atomId)) {
    aliases.add(variant)
  }

  for (const variant of buildAtomSlugVariants(slug)) {
    aliases.add(variant)
  }

  if (legacyLessonId) {
    aliases.add(legacyLessonId)
    for (const variant of buildAtomSlugVariants(legacyLessonId)) {
      aliases.add(variant)
    }
  }

  return Array.from(aliases)
}
