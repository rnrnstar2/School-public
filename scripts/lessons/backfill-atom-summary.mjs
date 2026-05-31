#!/usr/bin/env node
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')

const ATOMS_DIR = path.join(process.cwd(), 'lesson-factory', 'lessons', 'atoms')
const DEFAULT_SECTION_TITLE = 'レッスン本文'
const SUMMARY_MAX_LENGTH = 155
const SUMMARY_MIN_TARGET = 120

const SECTION_LABELS = new Map([
  ['なぜこのレッスン', { id: 'why', title: 'なぜこのレッスンか' }],
  ['手順', { id: 'how', title: '手順' }],
  ['詰まりやすいポイント', { id: 'blockers', title: '詰まりやすいポイント' }],
  ['完了の確認方法', { id: 'confirm', title: '完了の確認方法' }],
])

const HELP = `Usage:
  node scripts/lessons/backfill-atom-summary.mjs --dry-run
  node scripts/lessons/backfill-atom-summary.mjs --write

Options:
  --dry-run   Scan atoms and print the summaries that would be inserted.
  --write     Insert summary into atoms that do not already have one.
  --help      Show this message.
`

function parseArgs(argv) {
  const flags = new Set(argv)
  if (flags.has('--help') || flags.has('-h')) {
    return { help: true, write: false }
  }

  if (flags.has('--write') && flags.has('--dry-run')) {
    throw new Error('Use either --write or --dry-run, not both.')
  }

  return { help: false, write: flags.has('--write') }
}

function normalizeHeading(value) {
  return value.trim().replace(/^#+\s*/, '')
}

function compactWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripMarkdown(value) {
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
      .replace(/\|/g, ' '),
  )
}

function extractSections(bodyMarkdown) {
  const normalizedBody = bodyMarkdown.replace(/\r\n/g, '\n').trim()

  if (!normalizedBody) {
    return []
  }

  const lines = normalizedBody.split('\n')
  const sections = []
  let currentTitle = null
  let currentLines = []

  const pushSection = () => {
    if (!currentTitle && currentLines.length === 0) {
      return
    }

    const normalizedTitle = currentTitle ? normalizeHeading(currentTitle) : DEFAULT_SECTION_TITLE
    const mapped = SECTION_LABELS.get(normalizedTitle)

    sections.push({
      id: mapped?.id ?? 'other',
      title: mapped?.title ?? normalizedTitle,
      markdown: currentLines.join('\n').trim(),
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
  return sections
}

function isSkippableParagraph(markdown) {
  const text = markdown.trim()
  if (!text) return true
  if (/^#{1,6}\s+/.test(text)) return true
  if (/^!\[[^\]]*]\([^)]*\)$/.test(text)) return true
  if (/^[-*_]{3,}$/.test(text)) return true
  if (/^```/.test(text)) return true
  if (/^\|.*\|$/.test(text)) return true
  if (/^(?:[-*+]|\d+\.)\s+/.test(text)) return true
  return false
}

function proseParagraphs(markdown) {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '\n')

  return withoutCode
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => !isSkippableParagraph(paragraph))
    .map(stripMarkdown)
    .filter((paragraph) => paragraph.length >= 20)
}

function isPreferredSection(section) {
  const title = normalizeHeading(section.title)

  return (
    section.id === 'why' ||
    title === '概要' ||
    title === '学ぶこと' ||
    title === 'はじめに' ||
    title.includes('このレッスンで') ||
    title.includes('このレッスンのゴール') ||
    title.includes('身につくこと') ||
    title.includes('得られること') ||
    title.includes('手に入るもの')
  )
}

function joinForTargetLength(paragraphs) {
  let summary = ''

  for (const paragraph of paragraphs) {
    summary = summary ? `${summary} ${paragraph}` : paragraph
    if (summary.length >= SUMMARY_MIN_TARGET) {
      break
    }
  }

  return summary
}

function truncateSummary(value) {
  const summary = compactWhitespace(value)

  if (summary.length <= SUMMARY_MAX_LENGTH) {
    return summary
  }

  const slice = summary.slice(0, SUMMARY_MAX_LENGTH)
  const preferredBreak = Math.max(
    slice.lastIndexOf('。'),
    slice.lastIndexOf('！'),
    slice.lastIndexOf('？'),
    slice.lastIndexOf('.'),
  )

  if (preferredBreak >= SUMMARY_MIN_TARGET) {
    return slice.slice(0, preferredBreak + 1).trim()
  }

  const softBreak = Math.max(slice.lastIndexOf('、'), slice.lastIndexOf(' '), slice.lastIndexOf('　'))
  if (softBreak >= SUMMARY_MIN_TARGET) {
    return `${slice.slice(0, softBreak).trimEnd()}...`
  }

  return `${summary.slice(0, SUMMARY_MAX_LENGTH - 3).trimEnd()}...`
}

function buildSummary(bodyMarkdown) {
  const sections = extractSections(bodyMarkdown)
  const introSection = sections.find((section) => section.title === DEFAULT_SECTION_TITLE)
  const introParagraphs = introSection ? proseParagraphs(introSection.markdown) : []

  if (introParagraphs.length > 0) {
    return truncateSummary(joinForTargetLength(introParagraphs))
  }

  const preferredSection = sections.find((section) => isPreferredSection(section) && proseParagraphs(section.markdown).length > 0)
  if (preferredSection) {
    return truncateSummary(joinForTargetLength(proseParagraphs(preferredSection.markdown)))
  }

  for (const section of sections) {
    const paragraphs = proseParagraphs(section.markdown)
    if (paragraphs.length > 0) {
      return truncateSummary(joinForTargetLength(paragraphs))
    }
  }

  return null
}

function parseYamlDocument(content, filePath) {
  const parsed = yaml.load(content)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${filePath}: expected a top-level YAML mapping.`)
  }

  return parsed
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function yamlString(value) {
  return JSON.stringify(value)
}

function findInsertionIndex(lines) {
  const preferredKeys = ['title', 'id']

  for (const key of preferredKeys) {
    const index = lines.findIndex((line) => new RegExp(`^${key}:\\s*`).test(line))
    if (index !== -1) {
      return findTopLevelValueEnd(lines, index)
    }
  }

  return 0
}

function findTopLevelValueEnd(lines, startIndex) {
  const value = lines[startIndex]?.replace(/^[^:]+:\s*/, '').trim() ?? ''
  let index = startIndex + 1

  if (!/^[|>]/.test(value)) {
    return index
  }

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.trim() === '' || /^\s/.test(line)) {
      index += 1
      continue
    }
    break
  }

  return index
}

function insertSummary(content, summary) {
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  const insertionIndex = findInsertionIndex(lines)
  const nextLines = [
    ...lines.slice(0, insertionIndex),
    `summary: ${yamlString(summary)}`,
    ...lines.slice(insertionIndex),
  ]

  return nextLines.join(newline)
}

async function listAtomYamlFiles() {
  const entries = await fs.readdir(ATOMS_DIR, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
    .map((entry) => path.join(ATOMS_DIR, entry.name))
    .sort()
}

async function processAtom(filePath, write) {
  const content = await fs.readFile(filePath, 'utf8')
  const document = parseYamlDocument(content, filePath)

  if (hasOwn(document, 'summary')) {
    return { status: 'skipped-existing', filePath, summary: document.summary }
  }

  const bodyPath = filePath.replace(/\.ya?ml$/i, '.body.md')
  const bodyMarkdown = await fs.readFile(bodyPath, 'utf8')
  const summary = buildSummary(bodyMarkdown)

  if (!summary) {
    throw new Error(`${filePath}: could not extract summary from ${bodyPath}.`)
  }

  const nextContent = insertSummary(content, summary)
  const nextDocument = parseYamlDocument(nextContent, filePath)

  if (nextDocument.summary !== summary) {
    throw new Error(`${filePath}: inserted summary did not round-trip through js-yaml.`)
  }

  if (write) {
    await fs.writeFile(filePath, nextContent)
  }

  return { status: write ? 'updated' : 'would-update', filePath, summary }
}

function relativePath(filePath) {
  return path.relative(process.cwd(), filePath)
}

function printReport(results, write) {
  const counts = results.reduce(
    (acc, result) => {
      acc[result.status] = (acc[result.status] ?? 0) + 1
      return acc
    },
    {},
  )
  const changed = results.filter((result) => result.status === 'updated' || result.status === 'would-update')

  console.log(`Mode: ${write ? 'write' : 'dry-run'}`)
  console.log(`Atoms scanned: ${results.length}`)
  console.log(`Existing summary skipped: ${counts['skipped-existing'] ?? 0}`)
  console.log(`${write ? 'Updated' : 'Would update'}: ${changed.length}`)

  if (changed.length > 0) {
    console.log('')
    console.log('Examples:')
    for (const result of changed.slice(0, 8)) {
      console.log(`- ${relativePath(result.filePath)}: ${result.summary}`)
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP)
    return
  }

  const files = await listAtomYamlFiles()
  const results = []

  for (const filePath of files) {
    results.push(await processAtom(filePath, args.write))
  }

  printReport(results, args.write)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
