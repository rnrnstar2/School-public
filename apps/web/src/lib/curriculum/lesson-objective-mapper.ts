const CANONICAL_CAPABILITY_SLUGS = new Set([
  'scope-definition',
  'workflow-planning',
  'task-breakdown',
  'tooling-setup',
  'repo-initialization',
  'local-development',
  'version-control',
  'codebase-orientation',
  'styling-setup',
  'component-composition',
  'layout-building',
  'page-design',
  'routing',
  'design-consistency',
  'backend-setup',
  'env-management',
  'data-modeling',
  'database-read',
  'database-write',
  'auth-basics',
  'deployment-prep',
  'deployment',
  'production-debugging',
  'launch-verification',
  'polish',
  'handoff',
  'roadmapping',
  'database-modeling',
  'seo-basics',
  'supabase-setup',
  'vercel-deploy',
  'workflow-design',
  'ai-prompt-engineering',
  'tool-integration',
  'ai-writing',
  'content-strategy',
  'multimedia-creation',
  'prototyping',
  'ai-integration',
])

export const OBJECTIVE_ALIAS_TABLE: Record<string, string[]> = {
  'start-project': ['scope-definition'],
  'mvp-planning': ['workflow-planning'],
  'setup-environment': ['tooling-setup'],
  'create-project': ['repo-initialization'],
  'build-ui': ['component-composition'],
  'improve-design': ['design-consistency'],
  'connect-database': ['backend-setup'],
  vercel: ['vercel-deploy'],
  database_write: ['supabase-setup'],
  'データ設計': ['database-modeling'],
  'deploy-site': ['vercel-deploy'],
  'go-live': ['launch-verification'],
  'finish-project': ['handoff'],
  'iterate-product': ['roadmapping'],
  'deploy-app': ['vercel-deploy'],
  'deploy-site-to-vercel': ['vercel-deploy'],
}

function normalizeTag(value: string) {
  return value.trim().toLowerCase()
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

export function mapLessonTagsToCapabilities(
  tags: string[] | null | undefined,
  _domain?: string,
) {
  const resolved: string[] = []

  for (const rawTag of tags ?? []) {
    const tag = normalizeTag(rawTag)
    if (!tag) continue

    const aliases = OBJECTIVE_ALIAS_TABLE[tag]
    if (aliases) {
      resolved.push(...aliases)
      continue
    }

    if (CANONICAL_CAPABILITY_SLUGS.has(tag)) {
      resolved.push(tag)
    }
  }

  return unique(resolved)
}
