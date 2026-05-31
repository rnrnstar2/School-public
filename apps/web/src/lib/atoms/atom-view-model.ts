import { resolveLessonBodyContent } from '@/lib/curriculum/lesson-body-content'
import type { AtomRecord } from './atom-repository'

export type AtomSectionId = 'why' | 'how' | 'blockers' | 'confirm' | 'other'

export interface AtomSection {
  id: AtomSectionId
  title: string
  markdown: string
}

export interface AtomViewModel {
  atomId: string
  title: string
  summary: string
  personaTags: string[]
  goalTags: string[]
  capabilityOutputs: string[]
  hardPrerequisites: string[]
  softPrerequisites: string[]
  estimatedMinutes: number | null
  status: AtomRecord['status']
  deliverable: { type: string; validation: string }
  evidence: string[]
  mediaSlots: string[]
  bodyMarkdown: string
  sections: AtomSection[]
}

export interface AtomListViewModel {
  atomId: string
  title: string
  summary: string
  personaTags: string[]
  goalTags: string[]
  capabilityOutputs: string[]
  hardPrerequisites: string[]
  softPrerequisites: string[]
  estimatedMinutes: number | null
  status: AtomRecord['status']
  deliverable: { type: string; validation: string }
  evidence: string[]
  mediaSlots: string[]
}

const SECTION_LABELS: Record<string, { id: AtomSectionId; title: string }> = {
  'なぜこのレッスン': { id: 'why', title: 'なぜこのレッスンか' },
  手順: { id: 'how', title: '手順' },
  '詰まりやすいポイント': { id: 'blockers', title: '詰まりやすいポイント' },
  '完了の確認方法': { id: 'confirm', title: '完了の確認方法' },
}

const DEFAULT_SECTION_TITLE = 'レッスン本文'
const DEFAULT_BODY_MARKDOWN = '本文は準備中です。'

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripMarkdown(value: string) {
  return compactWhitespace(
    value
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/[*_~]/g, ' ')
      .replace(/\|/g, ' ')
  )
}

function truncateSummary(value: string, maxLength = 110) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`
}

function normalizeHeading(value: string) {
  return value.trim().replace(/^#+\s*/, '')
}

function normalizeSectionMarkdown(lines: string[]) {
  const markdown = lines.join('\n').trim()
  return markdown || DEFAULT_BODY_MARKDOWN
}

export function extractSections(bodyMarkdown: string | null | undefined): AtomSection[] {
  const normalizedBody = bodyMarkdown?.replace(/\r\n/g, '\n').trim() ?? ''

  if (!normalizedBody) {
    return [
      {
        id: 'other',
        title: DEFAULT_SECTION_TITLE,
        markdown: DEFAULT_BODY_MARKDOWN,
      },
    ]
  }

  const lines = normalizedBody.split('\n')
  const sections: AtomSection[] = []
  let currentTitle: string | null = null
  let currentLines: string[] = []

  const pushSection = () => {
    if (!currentTitle && currentLines.length === 0) {
      return
    }

    const normalizedTitle = currentTitle ? normalizeHeading(currentTitle) : DEFAULT_SECTION_TITLE
    const mapped = SECTION_LABELS[normalizedTitle]

    sections.push({
      id: mapped?.id ?? 'other',
      title: mapped?.title ?? normalizedTitle,
      markdown: normalizeSectionMarkdown(currentLines),
    })
  }

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/)

    if (headingMatch) {
      pushSection()
      currentTitle = headingMatch[1] ?? DEFAULT_SECTION_TITLE
      currentLines = []
      continue
    }

    currentLines.push(line)
  }

  pushSection()

  if (sections.length === 0) {
    return [
      {
        id: 'other',
        title: DEFAULT_SECTION_TITLE,
        markdown: normalizedBody,
      },
    ]
  }

  return sections
}

function buildSummary(sections: AtomSection[], bodyMarkdown: string, title: string) {
  const summarySource =
    sections.find((section) => section.id === 'why')?.markdown ??
    sections.find((section) => section.markdown.trim())?.markdown ??
    bodyMarkdown

  const summary = stripMarkdown(summarySource)

  if (!summary) {
    return `${title} の学習内容を確認します。`
  }

  return truncateSummary(summary)
}

function resolveListSummary(atom: AtomRecord) {
  const yamlSummary = atom.yamlContent.summary

  if (typeof yamlSummary === 'string' && yamlSummary.trim()) {
    return truncateSummary(compactWhitespace(yamlSummary))
  }

  if (atom.bodyMarkdown?.trim()) {
    const sections = extractSections(atom.bodyMarkdown)
    return buildSummary(sections, atom.bodyMarkdown, atom.title)
  }

  return `${atom.title} の学習内容を確認します。`
}

export function toAtomViewModel(atom: AtomRecord): AtomViewModel {
  const bodyMarkdown =
    resolveLessonBodyContent({
      primaryContent: atom.bodyMarkdown,
    }) ?? DEFAULT_BODY_MARKDOWN
  const sections = extractSections(bodyMarkdown)

  return {
    atomId: atom.atomId,
    title: atom.title,
    summary: buildSummary(sections, bodyMarkdown, atom.title),
    personaTags: atom.personaTags,
    goalTags: atom.goalTags,
    capabilityOutputs: atom.capabilityOutputs,
    hardPrerequisites: atom.hardPrerequisites,
    softPrerequisites: atom.softPrerequisites,
    estimatedMinutes: atom.estimatedMinutes,
    status: atom.status,
    deliverable: atom.deliverable,
    evidence: atom.evidence,
    mediaSlots: atom.mediaSlots,
    bodyMarkdown,
    sections,
  }
}

export function toAtomListViewModel(atom: AtomRecord): AtomListViewModel {
  return {
    atomId: atom.atomId,
    title: atom.title,
    summary: resolveListSummary(atom),
    personaTags: atom.personaTags,
    goalTags: atom.goalTags,
    capabilityOutputs: atom.capabilityOutputs,
    hardPrerequisites: atom.hardPrerequisites,
    softPrerequisites: atom.softPrerequisites,
    estimatedMinutes: atom.estimatedMinutes,
    status: atom.status,
    deliverable: atom.deliverable,
    evidence: atom.evidence,
    mediaSlots: atom.mediaSlots,
  }
}
