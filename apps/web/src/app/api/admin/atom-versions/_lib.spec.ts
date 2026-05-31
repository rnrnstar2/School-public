import { describe, expect, it } from 'vitest'

import {
  AtomVersionActionError,
  mutateAtomVersion,
  type AtomVersionRepository,
  type LessonAtomAuditInsert,
  type LessonAtomRow,
  type LessonAtomVersionRow,
} from './_lib'

function createRepositoryFixture(params?: {
  atom?: Partial<LessonAtomRow>
  versions?: LessonAtomVersionRow[]
}) {
  const atom: LessonAtomRow = {
    atom_id: 'atom-html-basics',
    current_version_id: 'version-current',
    source_path: 'atoms/html-basics.md',
    updated_at: '2026-04-08T09:00:00.000Z',
    ...params?.atom,
  }

  const versions = new Map<string, LessonAtomVersionRow>(
    (params?.versions ?? [
      {
        version_id: 'version-current',
        atom_id: atom.atom_id,
        status: 'stable',
        yaml_hash: null,
        yaml_content: { title: 'HTML Basics v2' },
        body_markdown: 'current body',
        metadata: {},
        imported_at: '2026-04-08T09:00:00.000Z',
        imported_by: 'lesson-factory-sync',
      },
      {
        version_id: 'version-previous',
        atom_id: atom.atom_id,
        status: 'reviewed',
        yaml_hash: null,
        yaml_content: { title: 'HTML Basics v1' },
        body_markdown: 'previous body',
        metadata: {},
        imported_at: '2026-04-07T09:00:00.000Z',
        imported_by: 'lesson-factory-sync',
      },
    ]).map((version) => [version.version_id, { ...version }]),
  )

  const audits: LessonAtomAuditInsert[] = []

  const repository: AtomVersionRepository = {
    async listVersions() {
      return Array.from(versions.values())
    },
    async getVersionById(versionId) {
      return versions.get(versionId) ?? null
    },
    async getAtomById(atomId) {
      return atom.atom_id === atomId ? { ...atom } : null
    },
    async listAtomsByIds(atomIds) {
      return atomIds.includes(atom.atom_id) ? [{ ...atom }] : []
    },
    async listVersionsByAtomId(atomId) {
      return Array.from(versions.values())
        .filter((version) => version.atom_id === atomId)
        .sort((left, right) => right.imported_at.localeCompare(left.imported_at))
    },
    async updateVersionStatus(versionId, status) {
      const version = versions.get(versionId)
      if (!version) {
        throw new Error(`Missing version ${versionId}`)
      }

      version.status = status
    },
    async updateAtomCurrentVersion(_atomId, currentVersionId) {
      atom.current_version_id = currentVersionId
    },
    async insertAudit(entry) {
      audits.push(entry)
    },
  }

  return {
    atom,
    versions,
    audits,
    repository,
  }
}

describe('mutateAtomVersion', () => {
  it('promotes a draft version to reviewed, moves current_version_id, and writes audit', async () => {
    const fixture = createRepositoryFixture({
      atom: {
        current_version_id: 'version-previous',
      },
      versions: [
        {
          version_id: 'version-draft',
          atom_id: 'atom-html-basics',
          status: 'draft',
          yaml_hash: null,
          yaml_content: { title: 'HTML Basics v3' },
          body_markdown: 'draft body',
          metadata: {},
          imported_at: '2026-04-08T09:00:00.000Z',
          imported_by: 'lesson-factory-sync',
        },
        {
          version_id: 'version-previous',
          atom_id: 'atom-html-basics',
          status: 'reviewed',
          yaml_hash: null,
          yaml_content: { title: 'HTML Basics v2' },
          body_markdown: 'reviewed body',
          metadata: {},
          imported_at: '2026-04-07T09:00:00.000Z',
          imported_by: 'lesson-factory-sync',
        },
      ],
    })

    const result = await mutateAtomVersion(
      fixture.repository,
      'user-admin',
      'version-draft',
      {
        action: 'promote',
        targetStatus: 'reviewed',
      },
    )

    expect(result.status).toBe('reviewed')
    expect(result.current_version_id).toBe('version-draft')
    expect(fixture.versions.get('version-draft')?.status).toBe('reviewed')
    expect(fixture.atom.current_version_id).toBe('version-draft')
    expect(fixture.audits).toHaveLength(1)
    expect(fixture.audits[0]?.action).toBe('atom_version.promote.reviewed')
  })

  it('rejects promote when target_status is omitted, which prevents implicit stable promotion', async () => {
    const fixture = createRepositoryFixture()

    await expect(
      mutateAtomVersion(fixture.repository, 'user-admin', 'version-current', {
        action: 'promote',
      }),
    ).rejects.toMatchObject({
      code: 'target_status_required',
      statusCode: 400,
    } satisfies Partial<AtomVersionActionError>)

    expect(fixture.audits).toHaveLength(0)
  })

  it('rolls back to the previous active version, archives the target, and writes audit', async () => {
    const fixture = createRepositoryFixture()

    const result = await mutateAtomVersion(
      fixture.repository,
      'user-admin',
      'version-current',
      {
        action: 'rollback',
      },
    )

    expect(result.status).toBe('archived')
    expect(result.current_version_id).toBe('version-previous')
    expect(fixture.versions.get('version-current')?.status).toBe('archived')
    expect(fixture.atom.current_version_id).toBe('version-previous')
    expect(fixture.audits).toHaveLength(1)
    expect(fixture.audits[0]?.action).toBe('atom_version.rollback')
  })

  it('archives the current version and automatically falls back to the previous active version', async () => {
    const fixture = createRepositoryFixture({
      atom: {
        current_version_id: 'version-current',
      },
      versions: [
        {
          version_id: 'version-current',
          atom_id: 'atom-html-basics',
          status: 'experimental',
          yaml_hash: null,
          yaml_content: { title: 'HTML Basics v2' },
          body_markdown: 'experimental body',
          metadata: {},
          imported_at: '2026-04-08T09:00:00.000Z',
          imported_by: 'lesson-factory-sync',
        },
        {
          version_id: 'version-previous',
          atom_id: 'atom-html-basics',
          status: 'reviewed',
          yaml_hash: null,
          yaml_content: { title: 'HTML Basics v1' },
          body_markdown: 'reviewed body',
          metadata: {},
          imported_at: '2026-04-07T09:00:00.000Z',
          imported_by: 'lesson-factory-sync',
        },
      ],
    })

    const result = await mutateAtomVersion(
      fixture.repository,
      'user-admin',
      'version-current',
      {
        action: 'archive',
      },
    )

    expect(result.status).toBe('archived')
    expect(result.current_version_id).toBe('version-previous')
    expect(fixture.versions.get('version-current')?.status).toBe('archived')
    expect(fixture.atom.current_version_id).toBe('version-previous')
    expect(fixture.audits).toHaveLength(1)
    expect(fixture.audits[0]?.action).toBe('atom_version.archive')
  })

  it('promotes explicitly to stable and still writes audit', async () => {
    const fixture = createRepositoryFixture({
      atom: {
        current_version_id: 'version-previous',
      },
      versions: [
        {
          version_id: 'version-candidate',
          atom_id: 'atom-html-basics',
          status: 'experimental',
          yaml_hash: null,
          yaml_content: { title: 'HTML Basics v3' },
          body_markdown: 'candidate body',
          metadata: {},
          imported_at: '2026-04-08T09:00:00.000Z',
          imported_by: 'lesson-factory-sync',
        },
        {
          version_id: 'version-previous',
          atom_id: 'atom-html-basics',
          status: 'stable',
          yaml_hash: null,
          yaml_content: { title: 'HTML Basics v2' },
          body_markdown: 'stable body',
          metadata: {},
          imported_at: '2026-04-07T09:00:00.000Z',
          imported_by: 'lesson-factory-sync',
        },
      ],
    })

    const result = await mutateAtomVersion(
      fixture.repository,
      'user-admin',
      'version-candidate',
      {
        action: 'promote',
        targetStatus: 'stable',
      },
    )

    expect(result.status).toBe('stable')
    expect(result.current_version_id).toBe('version-candidate')
    expect(fixture.versions.get('version-candidate')?.status).toBe('stable')
    expect(fixture.atom.current_version_id).toBe('version-candidate')
    expect(fixture.audits).toHaveLength(1)
    expect(fixture.audits[0]?.action).toBe('atom_version.promote.stable')
  })
})
