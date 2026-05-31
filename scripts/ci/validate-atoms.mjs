#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const requireFromLessonFactory = createRequire(
  path.join(REPO_ROOT, 'lesson-factory', 'package.json'),
)

const AjvModule = requireFromLessonFactory('ajv')
const addFormatsModule = requireFromLessonFactory('ajv-formats')
const YAMLModule = requireFromLessonFactory('yaml')

const Ajv = AjvModule.default ?? AjvModule
const addFormats = addFormatsModule.default ?? addFormatsModule
const YAML = YAMLModule.default ?? YAMLModule

const DEFAULT_ATOMS_DIR = path.join(REPO_ROOT, 'lesson-factory', 'lessons', 'atoms')
const DEFAULT_SCHEMA_PATH = path.join(REPO_ROOT, 'lesson-factory', 'schemas', 'atom.schema.json')
const DEFAULT_CAPABILITIES_PATH = path.join(REPO_ROOT, 'docs', 'capabilities.yaml')

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath) || '.'
}

function parseYaml(source, label) {
  const document = YAML.parseDocument(source)
  if (document.errors.length > 0) {
    const message = document.errors.map((error) => error.message).join('; ')
    throw new Error(`${label}: ${message}`)
  }

  return document.toJS()
}

async function readYamlFile(filePath) {
  const raw = await readFile(filePath, 'utf8')
  return parseYaml(raw, relativeToRepo(filePath))
}

async function listAtomFiles(atomsDir) {
  const entries = await readdir(atomsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
    .map((entry) => path.join(atomsDir, entry.name))
    .sort()
}

function registerCapabilityLookup({
  lookup,
  otherLookup,
  canonical,
  candidate,
  canonicalId,
  kind,
  otherKind,
  sourceLabel,
}) {
  const normalizedCandidate = typeof candidate === 'string' ? candidate.trim() : ''
  if (!normalizedCandidate || normalizedCandidate === canonicalId) {
    return
  }

  if (canonical.has(normalizedCandidate)) {
    throw new Error(
      `${sourceLabel}: ${kind} "${normalizedCandidate}" conflicts with canonical capability id`,
    )
  }

  if (otherLookup.has(normalizedCandidate)) {
    throw new Error(
      `${sourceLabel}: ${kind} "${normalizedCandidate}" is already registered as ${otherKind}`,
    )
  }

  const existing = lookup.get(normalizedCandidate)
  if (existing && existing !== canonicalId) {
    throw new Error(
      `${sourceLabel}: ${kind} "${normalizedCandidate}" maps to both "${existing}" and "${canonicalId}"`,
    )
  }

  lookup.set(normalizedCandidate, canonicalId)
}

export async function loadCapabilityMaster(capabilitiesPath = DEFAULT_CAPABILITIES_PATH) {
  const parsed = await readYamlFile(capabilitiesPath)
  const capabilities = Array.isArray(parsed?.capabilities) ? parsed.capabilities : []
  const sourceLabel = relativeToRepo(capabilitiesPath)
  const canonical = new Set()
  const alias = new Map()
  const deprecated = new Map()

  for (const capability of capabilities) {
    const capabilityId = capability?.id
    if (typeof capabilityId !== 'string' || capabilityId.length === 0) {
      continue
    }

    if (alias.has(capabilityId) || deprecated.has(capabilityId)) {
      throw new Error(
        `${sourceLabel}: canonical capability id "${capabilityId}" conflicts with alias registration`,
      )
    }

    canonical.add(capabilityId)
  }

  for (const capability of capabilities) {
    const canonicalId = capability?.id
    if (typeof canonicalId !== 'string' || canonicalId.length === 0) {
      continue
    }

    const synonyms = Array.isArray(capability?.synonyms) ? capability.synonyms : []
    for (const synonym of synonyms) {
      registerCapabilityLookup({
        lookup: alias,
        otherLookup: deprecated,
        canonical,
        candidate: synonym,
        canonicalId,
        kind: 'alias',
        otherKind: 'deprecated alias',
        sourceLabel,
      })
    }

    const deprecatedAliases = Array.isArray(capability?.deprecated_aliases)
      ? capability.deprecated_aliases
      : []
    for (const deprecatedAlias of deprecatedAliases) {
      registerCapabilityLookup({
        lookup: deprecated,
        otherLookup: alias,
        canonical,
        candidate: deprecatedAlias,
        canonicalId,
        kind: 'deprecated alias',
        otherKind: 'alias',
        sourceLabel,
      })
    }
  }

  return {
    canonical,
    alias,
    deprecated,
    parsed,
  }
}

async function loadAtomSchema(schemaPath = DEFAULT_SCHEMA_PATH) {
  const raw = await readFile(schemaPath, 'utf8')
  return JSON.parse(raw)
}

export function createAtomValidator(schema) {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateSchema: false,
  })
  addFormats(ajv)
  return ajv.compile(schema)
}

function formatSchemaError(error) {
  const location = error.instancePath || '/'
  if (error.keyword === 'required' && error.params?.missingProperty) {
    return `${location}: missing required property ${error.params.missingProperty}`
  }

  return `${location}: ${error.message || 'schema validation error'}`
}

export function validateAtomPayload({ atom, filePath, validate, capabilityMaster }) {
  const warnings = []
  const { canonical, alias, deprecated } = capabilityMaster

  const isValid = validate(atom)
  if (!isValid) {
    for (const error of validate.errors ?? []) {
      warnings.push({
        kind: 'schema',
        filePath,
        message: formatSchemaError(error),
      })
    }
  }

  for (const fieldName of ['capability_inputs', 'capability_outputs']) {
    const values = atom?.[fieldName]
    if (!Array.isArray(values)) {
      continue
    }

    for (const [index, capabilityId] of values.entries()) {
      if (typeof capabilityId !== 'string') {
        continue
      }

      if (canonical.has(capabilityId) || alias.has(capabilityId)) {
        continue
      }

      const deprecatedCanonical = deprecated.get(capabilityId)
      if (deprecatedCanonical) {
        warnings.push({
          kind: 'deprecated_alias',
          filePath,
          message: `/${fieldName}/${index}: deprecated capability alias "${capabilityId}" should be replaced with "${deprecatedCanonical}"`,
        })
        continue
      }

      warnings.push({
        kind: 'capability',
        filePath,
        message: `/${fieldName}/${index}: unknown capability id "${capabilityId}"`,
      })
    }
  }

  return warnings
}

export async function runValidation({
  atomsDir = DEFAULT_ATOMS_DIR,
  atomFiles,
  schemaPath = DEFAULT_SCHEMA_PATH,
  capabilitiesPath = DEFAULT_CAPABILITIES_PATH,
} = {}) {
  const files = atomFiles ? [...atomFiles].sort() : await listAtomFiles(atomsDir)
  const [capabilityMaster, schema] = await Promise.all([
    loadCapabilityMaster(capabilitiesPath),
    loadAtomSchema(schemaPath),
  ])
  const validate = createAtomValidator(schema)

  const warnings = []
  let schemaWarningCount = 0
  let capabilityWarningCount = 0
  let deprecatedAliasWarningCount = 0
  let parseWarningCount = 0
  let filesWithWarnings = 0

  for (const filePath of files) {
    let fileWarnings = []

    try {
      const atom = await readYamlFile(filePath)
      fileWarnings = validateAtomPayload({ atom, filePath, validate, capabilityMaster })
    } catch (error) {
      fileWarnings = [
        {
          kind: 'parse',
          filePath,
          message: error instanceof Error ? error.message : String(error),
        },
      ]
    }

    if (fileWarnings.length > 0) {
      filesWithWarnings += 1
      warnings.push(...fileWarnings)
    }

    for (const warning of fileWarnings) {
      if (warning.kind === 'schema') {
        schemaWarningCount += 1
      } else if (warning.kind === 'capability') {
        capabilityWarningCount += 1
      } else if (warning.kind === 'deprecated_alias') {
        deprecatedAliasWarningCount += 1
      } else if (warning.kind === 'parse') {
        parseWarningCount += 1
      }
    }
  }

  return {
    filesScanned: files.length,
    filesWithWarnings,
    warningCount: warnings.length,
    schemaWarningCount,
    capabilityWarningCount,
    deprecatedAliasWarningCount,
    parseWarningCount,
    warnings: warnings.map((warning) => ({
      ...warning,
      relativePath: relativeToRepo(warning.filePath),
    })),
  }
}

export function formatWarnings(summary) {
  if (summary.warnings.length === 0) {
    return ['warn: none']
  }

  return summary.warnings.map((warning) => {
    return `warn [${warning.kind}] ${warning.relativePath}: ${warning.message}`
  })
}

export function formatSummary(summary) {
  return [
    `summary: scanned=${summary.filesScanned}`,
    `warnings=${summary.warningCount}`,
    `files_with_warnings=${summary.filesWithWarnings}`,
    `schema=${summary.schemaWarningCount}`,
    `capability=${summary.capabilityWarningCount}`,
    `deprecated_alias=${summary.deprecatedAliasWarningCount}`,
    `parse=${summary.parseWarningCount}`,
  ].join(' ')
}

async function main() {
  const summary = await runValidation()
  console.log('validate-atoms')
  for (const line of formatWarnings(summary)) {
    console.log(line)
  }
  console.log(formatSummary(summary))
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isEntrypoint) {
  main().catch((error) => {
    console.error(`validate-atoms fatal: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
