import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  fetchAnchorForPersona,
  type PersonaAnchorRecord,
} from '@/lib/atoms/atom-repository'

const LOCAL_ANCHOR_PATHS_BY_PERSONA: Record<string, string[]> = {
  'persona.web-builder': [
    'lesson-factory/lessons/anchors/web-builder.yaml',
    '../lesson-factory/lessons/anchors/web-builder.yaml',
    '../../lesson-factory/lessons/anchors/web-builder.yaml',
  ],
  // TQ-217: web-builder anchor の textbook 経路 (CLI / git / pnpm / Next.js /
  // shadcn) を退避した regression anchor。default の web-builder anchor は
  // no-code-first へ刷新済みで、本 anchor は P-ENG-PROTOTYPE 等 CLI 前提
  // 層が opt-in で使える形で残す。
  'persona.web-builder.cli': [
    'lesson-factory/lessons/anchors/web-builder-cli.yaml',
    '../lesson-factory/lessons/anchors/web-builder-cli.yaml',
    '../../lesson-factory/lessons/anchors/web-builder-cli.yaml',
  ],
  // TQ-224: web-builder 以外の主要 persona に anchor を拡張。Investigator 9 で
  // 検出された「fetchAnchorForPersona() が web-builder 以外で必ず null」状態を
  // 解消し、AI フル活用 × 非エンジニア × 最短の三軸を Lane 拡張する。
  'persona.ai-app-builder': [
    'lesson-factory/lessons/anchors/ai-app-builder.yaml',
    '../lesson-factory/lessons/anchors/ai-app-builder.yaml',
    '../../lesson-factory/lessons/anchors/ai-app-builder.yaml',
  ],
  'persona.saas-mvp': [
    'lesson-factory/lessons/anchors/saas-mvp.yaml',
    '../lesson-factory/lessons/anchors/saas-mvp.yaml',
    '../../lesson-factory/lessons/anchors/saas-mvp.yaml',
  ],
  'persona.nonengineer-marketer': [
    'lesson-factory/lessons/anchors/nonengineer-marketer.yaml',
    '../lesson-factory/lessons/anchors/nonengineer-marketer.yaml',
    '../../lesson-factory/lessons/anchors/nonengineer-marketer.yaml',
  ],
  'persona.designer': [
    'lesson-factory/lessons/anchors/designer.yaml',
    '../lesson-factory/lessons/anchors/designer.yaml',
    '../../lesson-factory/lessons/anchors/designer.yaml',
  ],
  // W46 (2026-05-09): Audit G 1 / Audit C 軸 1 (CR-4 Vision 完全逆転) 解消。
  // ai-freelancer / ai-content-creator / ai-automation の 3 persona は
  // SUPPORTED_PERSONA_IDS / og / share / smoke 等で参照されているのに anchor が
  // 無く、hearing で「動画毎週投稿」「副業で稼ぐ」「Excel 自動化」goal が
  // web-builder anchor 経由で CLI 系 atom にぶつかっていた状態を 9/9 anchor 化で解消。
  'persona.ai-freelancer': [
    'lesson-factory/lessons/anchors/ai-freelancer.yaml',
    '../lesson-factory/lessons/anchors/ai-freelancer.yaml',
    '../../lesson-factory/lessons/anchors/ai-freelancer.yaml',
  ],
  'persona.ai-content-creator': [
    'lesson-factory/lessons/anchors/ai-content-creator.yaml',
    '../lesson-factory/lessons/anchors/ai-content-creator.yaml',
    '../../lesson-factory/lessons/anchors/ai-content-creator.yaml',
  ],
  'persona.ai-automation': [
    'lesson-factory/lessons/anchors/ai-automation.yaml',
    '../lesson-factory/lessons/anchors/ai-automation.yaml',
    '../../lesson-factory/lessons/anchors/ai-automation.yaml',
  ],
  // W51 (2026-05-09): persona.crm-builder の yaml は W49 で land 済みだが
  // local fallback の lookup key が抜けていたので追加 (DB seed 9/9 化と同時に
  // local fallback も 9/9 にする)。
  'persona.crm-builder': [
    'lesson-factory/lessons/anchors/crm-builder.yaml',
    '../lesson-factory/lessons/anchors/crm-builder.yaml',
    '../../lesson-factory/lessons/anchors/crm-builder.yaml',
  ],
  // W67 (2026-05-09 / Wave 14, Audit A4 b-axis + B4 #3): 非エンジニア向け
  // Web アプリ persona。graduation matrix で既に canonical key だったのに
  // anchor yaml が無く、live-hearing path で発火しない synthetic 状態だった
  // のを 9/9 anchor 化で解消する。
  'persona.noneng-webapp': [
    'lesson-factory/lessons/anchors/noneng-webapp.yaml',
    '../lesson-factory/lessons/anchors/noneng-webapp.yaml',
    '../../lesson-factory/lessons/anchors/noneng-webapp.yaml',
  ],
}

const localAnchorCache = new Map<string, Promise<PersonaAnchorRecord | null>>()

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function parseAnchorYaml(source: string): PersonaAnchorRecord | null {
  let anchorId = ''
  let personaId = ''
  let description: string | null = null
  const orderedAtomIds: string[] = []
  const requiredCapabilities: string[] = []
  let activeList: 'orderedAtomIds' | 'requiredCapabilities' | null = null

  for (const rawLine of source.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    if (trimmed.startsWith('id:')) {
      anchorId = trimmed.slice('id:'.length).trim()
      activeList = null
      continue
    }
    if (trimmed.startsWith('persona_id:')) {
      personaId = trimmed.slice('persona_id:'.length).trim()
      activeList = null
      continue
    }
    if (trimmed.startsWith('ordered_atom_ids:')) {
      activeList = 'orderedAtomIds'
      continue
    }
    if (trimmed.startsWith('required_capabilities:')) {
      activeList = 'requiredCapabilities'
      continue
    }
    if (trimmed.startsWith('description:')) {
      description = trimmed.slice('description:'.length).trim() || null
      activeList = null
      continue
    }
    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim()
      if (!value) {
        continue
      }

      if (activeList === 'orderedAtomIds') {
        orderedAtomIds.push(value)
      } else if (activeList === 'requiredCapabilities') {
        requiredCapabilities.push(value)
      }
    }
  }

  if (!anchorId || !personaId) {
    return null
  }

  return {
    anchorId,
    personaId,
    orderedAtomIds: toStringArray(orderedAtomIds),
    requiredCapabilities: toStringArray(requiredCapabilities),
    description,
  }
}

async function resolveExistingPath(candidatePaths: string[]) {
  for (const candidatePath of candidatePaths) {
    const absolutePath = path.resolve(process.cwd(), candidatePath)
    try {
      await access(absolutePath)
      return absolutePath
    } catch {
      continue
    }
  }

  return null
}

async function loadLocalAnchorForPersona(personaId: string): Promise<PersonaAnchorRecord | null> {
  const candidatePaths = LOCAL_ANCHOR_PATHS_BY_PERSONA[personaId]
  if (!candidatePaths) {
    return null
  }

  const anchorPath = await resolveExistingPath(candidatePaths)
  if (!anchorPath) {
    return null
  }

  return parseAnchorYaml(await readFile(anchorPath, 'utf8'))
}

export async function resolvePersonaAnchor(personaId: string): Promise<PersonaAnchorRecord | null> {
  const dbAnchor = await fetchAnchorForPersona(personaId)
  if (dbAnchor) {
    return dbAnchor
  }

  const cached = localAnchorCache.get(personaId)
  if (cached) {
    return cached
  }

  const pending = loadLocalAnchorForPersona(personaId)
  localAnchorCache.set(personaId, pending)
  return pending
}

export async function resolvePersonaAnchors(personaIds: string[]): Promise<PersonaAnchorRecord[]> {
  const uniquePersonaIds = Array.from(
    new Set(personaIds.map((personaId) => personaId.trim()).filter(Boolean)),
  )

  const anchors = await Promise.all(uniquePersonaIds.map((personaId) => resolvePersonaAnchor(personaId)))
  return anchors.filter((anchor): anchor is PersonaAnchorRecord => Boolean(anchor))
}
