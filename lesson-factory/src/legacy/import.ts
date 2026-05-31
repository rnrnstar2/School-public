import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import ts from 'typescript'

import { getLessonsAtomsDir, resolveRepoPath } from '../core/paths.js'
import { schemaValidator } from '../core/schema-validator.js'
import type {
  DeliverableType,
  EvidenceType,
  Lesson,
} from '../core/types.js'
import { stringifyYaml } from '../core/yaml-io.js'

const DEFAULT_TRACK_ID = 'web-builder-ai'
const DEFAULT_PERSONA_TAG = 'web-builder'
const DEFAULT_GOAL_TAG = 'website-launch'
const DEFAULT_VALIDATION = 'basic_manual_check_v1'
const DEFAULT_MEDIA_SLOT = 'screen_capture'
const CODE_DELIVERABLE_PATTERN =
  /\bnpm run\b|\bgit\b|\bsql\b|\bcode\b|\bcli\b|\bpnpm\b|\bnode\.js\b/i

type AstValue =
  | string
  | number
  | boolean
  | null
  | AstValue[]
  | { [key: string]: AstValue }

interface LegacyLessonCopy {
  legacyId: string
  title: string
  summary: string
  moduleTitle: string
}

interface LegacyMilestoneCopy {
  id: string
  title: string
  description: string
  evidence: string[]
  artifactGoal: string
}

interface LegacyBlueprint {
  slug: string
  title: string
  summary: string
  moduleId: string
  milestoneId: string
  minutes: number
  whyThisMatters: string
  howToDo: string
  commonBlockers: string
  confirmationMethod: string
  prerequisites: string[]
  goalTags: string[]
  capabilityTags: string[]
  blockerTags: string[]
  personaTags: string[]
}

interface LegacyTrackSource {
  trackId: string
  lessons: LegacyLessonCopy[]
  milestones: Map<string, LegacyMilestoneCopy>
  blueprints: Map<string, LegacyBlueprint>
}

export interface LegacyImportLessonRecord {
  legacyId: string
  atomId: string
  slug: string
  title: string
  summary: string
  moduleTitle: string
  milestoneId: string
  milestoneTitle: string
  estimatedMinutes: number
  tags: string[]
  yamlPath: string
  bodyPath: string
  lesson: Lesson
  bodyMarkdown: string
  skipped: boolean
  droppedHardPrerequisites: string[]
}

export interface LegacyImportResult {
  trackId: string
  sourceDir: string
  outDir: string
  dryRun: boolean
  force: boolean
  lessons: LegacyImportLessonRecord[]
  counts: {
    totalLessons: number
    writeCount: number
    skipCount: number
  }
  goalTagCoverage: string[]
  milestoneDistribution: Record<string, string[]>
  rootAtomIds: string[]
  leafAtomIds: string[]
}

export interface LegacyImportOptions {
  sourceDir?: string
  outDir?: string
  dryRun?: boolean
  force?: boolean
}

export function getDefaultLegacyImportSourceDir(): string {
  return resolveRepoPath('apps', 'web', 'src', 'lib', 'curriculum')
}

export function getDefaultLegacyImportOutDir(): string {
  return getLessonsAtomsDir()
}

export async function runLegacyImport({
  sourceDir = getDefaultLegacyImportSourceDir(),
  outDir = getDefaultLegacyImportOutDir(),
  dryRun = false,
  force = false,
}: LegacyImportOptions = {}): Promise<LegacyImportResult> {
  const resolvedSourceDir = path.resolve(sourceDir)
  const resolvedOutDir = path.resolve(outDir)
  const source = await loadLegacyTrackSource(resolvedSourceDir)
  const lessons = await buildImportRecords({
    source,
    outDir: resolvedOutDir,
    force,
  })

  await validateImportRecords(lessons)

  if (!dryRun) {
    await mkdir(resolvedOutDir, { recursive: true })
    for (const lesson of lessons) {
      if (lesson.skipped) {
        continue
      }

      await writeFile(lesson.yamlPath, stringifyYaml(lesson.lesson), 'utf8')
      await writeFile(lesson.bodyPath, `${lesson.bodyMarkdown.trimEnd()}\n`, 'utf8')
    }
  }

  const referencedAtomIds = new Set<string>()
  const milestoneDistribution: Record<string, string[]> = {}

  for (const lesson of lessons) {
    lesson.lesson.hard_prerequisites.forEach((atomId) => {
      referencedAtomIds.add(atomId)
    })
    const milestoneAtomIds = milestoneDistribution[lesson.milestoneId] ?? []
    milestoneAtomIds.push(lesson.atomId)
    milestoneDistribution[lesson.milestoneId] = milestoneAtomIds
  }

  Object.values(milestoneDistribution).forEach((atomIds) => atomIds.sort())

  return {
    trackId: source.trackId,
    sourceDir: resolvedSourceDir,
    outDir: resolvedOutDir,
    dryRun,
    force,
    lessons,
    counts: {
      totalLessons: lessons.length,
      writeCount: lessons.filter((lesson) => !lesson.skipped).length,
      skipCount: lessons.filter((lesson) => lesson.skipped).length,
    },
    goalTagCoverage: uniqueStrings(
      lessons.flatMap((lesson) => lesson.lesson.goal_tags),
    ).sort(),
    milestoneDistribution,
    rootAtomIds: lessons
      .filter((lesson) => lesson.lesson.hard_prerequisites.length === 0)
      .map((lesson) => lesson.atomId)
      .sort(),
    leafAtomIds: lessons
      .filter((lesson) => !referencedAtomIds.has(lesson.atomId))
      .map((lesson) => lesson.atomId)
      .sort(),
  }
}

function formatSectionBody(primary: string, fallback: string): string {
  const value = primary.trim() || fallback.trim()
  return value || 'このレッスンの要点を短くまとめてから着手してください。'
}

function buildBodyMarkdown({
  summary,
  whyThisMatters,
  howToDo,
  commonBlockers,
  confirmationMethod,
}: {
  summary: string
  whyThisMatters: string
  howToDo: string
  commonBlockers: string
  confirmationMethod: string
}): string {
  return [
    '## なぜこのレッスン',
    formatSectionBody(whyThisMatters, summary),
    '',
    '## 手順',
    formatSectionBody(howToDo, summary),
    '',
    '## 詰まりやすいポイント',
    formatSectionBody(commonBlockers, summary),
    '',
    '## 完了の確認方法',
    formatSectionBody(confirmationMethod, summary),
  ].join('\n')
}

function inferDeliverableType(input: string): DeliverableType {
  return CODE_DELIVERABLE_PATTERN.test(input) ? 'code_snippet' : 'markdown_doc'
}

function inferEvidence(type: DeliverableType): EvidenceType[] {
  return type === 'code_snippet' ? ['test_result'] : ['screenshot']
}

async function buildImportRecords({
  source,
  outDir,
  force,
}: {
  source: LegacyTrackSource
  outDir: string
  force: boolean
}): Promise<LegacyImportLessonRecord[]> {
  const lessons = await Promise.all(
    source.lessons.map(async (lessonCopy) => {
      const slug = slugFromLegacyLessonId(lessonCopy.legacyId)
      const atomId = atomIdFromLegacyLessonId(lessonCopy.legacyId)
      const blueprint = source.blueprints.get(slug)
      if (!blueprint) {
        throw new Error(
          `Legacy import could not find a matching lesson blueprint for ${lessonCopy.legacyId} (${slug})`,
        )
      }

      const milestone = source.milestones.get(blueprint.milestoneId)

      const deliverableType = inferDeliverableType(
        [
          lessonCopy.title,
          lessonCopy.summary,
          blueprint.title,
          blueprint.summary,
          blueprint.whyThisMatters,
          blueprint.howToDo,
          blueprint.commonBlockers,
          blueprint.confirmationMethod,
        ].join('\n'),
      )

      const lesson: Lesson = {
        id: atomId,
        title: lessonCopy.title,
        persona_tags: [DEFAULT_PERSONA_TAG],
        goal_tags: uniqueStrings([DEFAULT_GOAL_TAG, ...blueprint.goalTags]),
        capability_inputs: [],
        capability_outputs: [],
        hard_prerequisites: uniqueStrings(
          blueprint.prerequisites.map((legacyId) => atomIdFromLegacyLessonId(legacyId)),
        ),
        soft_prerequisites: [],
        deliverable: {
          type: deliverableType,
          validation: DEFAULT_VALIDATION,
        },
        evidence: inferEvidence(deliverableType),
        media_slots: [DEFAULT_MEDIA_SLOT],
        freshness_sources: [],
        status: 'draft',
      }

      const bodyMarkdown = buildBodyMarkdown({
        summary: lessonCopy.summary,
        whyThisMatters: blueprint.whyThisMatters,
        howToDo: blueprint.howToDo,
        commonBlockers: blueprint.commonBlockers,
        confirmationMethod: blueprint.confirmationMethod,
      })
      const yamlPath = path.join(outDir, `${atomId}.yaml`)
      const bodyPath = path.join(outDir, `${atomId}.body.md`)
      const skipped =
        !force && ((await fileExists(yamlPath)) || (await fileExists(bodyPath)))

      return {
        legacyId: lessonCopy.legacyId,
        atomId,
        slug,
        title: lessonCopy.title,
        summary: lessonCopy.summary,
        moduleTitle: lessonCopy.moduleTitle,
        milestoneId: blueprint.milestoneId,
        milestoneTitle: milestone?.title ?? blueprint.milestoneId,
        estimatedMinutes: blueprint.minutes,
        tags: uniqueStrings([
          ...blueprint.goalTags,
          ...blueprint.capabilityTags,
          ...blueprint.blockerTags,
          ...blueprint.personaTags,
        ]),
        yamlPath,
        bodyPath,
        lesson,
        bodyMarkdown,
        skipped,
        droppedHardPrerequisites: [] as string[],
      }
    }),
  )

  const importAtomIds = new Set(lessons.map((lesson) => lesson.atomId))

  for (const lesson of lessons) {
    const keptPrerequisites = lesson.lesson.hard_prerequisites.filter((atomId) =>
      importAtomIds.has(atomId),
    )
    lesson.droppedHardPrerequisites = lesson.lesson.hard_prerequisites.filter(
      (atomId) => !importAtomIds.has(atomId),
    )
    lesson.lesson.hard_prerequisites = keptPrerequisites
  }

  return lessons.sort((left, right) => left.legacyId.localeCompare(right.legacyId))
}

async function validateImportRecords(
  lessons: LegacyImportLessonRecord[],
): Promise<void> {
  const atomIds = new Set<string>()
  const issues: string[] = []

  for (const lesson of lessons) {
    if (!lesson.bodyMarkdown.trim()) {
      issues.push(`${lesson.atomId}: body_markdown is empty`)
    }

    if (atomIds.has(lesson.atomId)) {
      issues.push(`${lesson.atomId}: duplicate atom id`)
    }
    atomIds.add(lesson.atomId)
  }

  for (const lesson of lessons) {
    for (const prerequisiteId of lesson.lesson.hard_prerequisites) {
      if (!atomIds.has(prerequisiteId)) {
        issues.push(
          `${lesson.atomId}: orphan hard prerequisite reference ${prerequisiteId}`,
        )
      }
    }
  }

  for (const lesson of lessons) {
    try {
      await schemaValidator.validateWithSchemaFile<Lesson>(
        'lesson.schema.json',
        lesson.lesson,
      )
    } catch (error) {
      if (error instanceof Error) {
        issues.push(`${lesson.atomId}: ${error.message}`)
      } else {
        issues.push(`${lesson.atomId}: ${String(error)}`)
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(
      ['Legacy import validation failed:', ...issues.map((issue) => `- ${issue}`)].join(
        '\n',
      ),
    )
  }
}

async function loadLegacyTrackSource(sourceDir: string): Promise<LegacyTrackSource> {
  const lessonLibraryPath = path.join(sourceDir, 'lesson-library.ts')
  const webBuilderTrackPath = path.join(sourceDir, 'web-builder-track.ts')

  const [lessonLibraryFile, webBuilderTrackFile] = await Promise.all([
    readTypeScriptFile(lessonLibraryPath),
    readTypeScriptFile(webBuilderTrackPath),
  ])

  const lessonCopyNode = getVariableInitializer(
    lessonLibraryFile,
    'lessonCopyById',
  )
  const milestoneCopyNode = getVariableInitializer(
    lessonLibraryFile,
    'milestoneCopyById',
  )
  const lessonBlueprintsNode = getVariableInitializer(
    webBuilderTrackFile,
    'lessonBlueprints',
  )
  const webBuilderTrackNode = getVariableInitializer(
    webBuilderTrackFile,
    'webBuilderTrack',
  )

  const lessonCopy = asRecord(evaluateNode(lessonCopyNode), 'lessonCopyById')
  const milestoneCopy = asRecord(
    evaluateNode(milestoneCopyNode),
    'milestoneCopyById',
  )
  const lessonBlueprints = asArray(
    evaluateNode(lessonBlueprintsNode),
    'lessonBlueprints',
  )
  const trackId = getObjectLiteralStringProperty(
    webBuilderTrackNode,
    'id',
    DEFAULT_TRACK_ID,
  )

  return {
    trackId,
    lessons: Object.entries(lessonCopy)
      .map(([legacyId, rawLesson]) => {
        const lesson = asRecord(rawLesson, `lessonCopyById.${legacyId}`)
        return {
          legacyId,
          title: asString(getRequiredRecordValue(lesson, 'title'), `${legacyId}.title`),
          summary: asString(
            getRequiredRecordValue(lesson, 'summary'),
            `${legacyId}.summary`,
          ),
          moduleTitle: asString(
            getRequiredRecordValue(lesson, 'moduleTitle'),
            `${legacyId}.moduleTitle`,
          ),
        }
      })
      .sort((left, right) => left.legacyId.localeCompare(right.legacyId)),
    milestones: new Map(
      Object.entries(milestoneCopy).map(([milestoneId, rawMilestone]) => {
        const milestone = asRecord(
          rawMilestone,
          `milestoneCopyById.${milestoneId}`,
        )
        return [
          milestoneId,
          {
            id: milestoneId,
            title: asString(
              getRequiredRecordValue(milestone, 'title'),
              `${milestoneId}.title`,
            ),
            description: asString(
              getRequiredRecordValue(milestone, 'description'),
              `${milestoneId}.description`,
            ),
            evidence: asStringArray(
              getRequiredRecordValue(milestone, 'evidence'),
              `${milestoneId}.evidence`,
            ),
            artifactGoal: asString(
              getRequiredRecordValue(milestone, 'artifactGoal'),
              `${milestoneId}.artifactGoal`,
            ),
          },
        ] satisfies [string, LegacyMilestoneCopy]
      }),
    ),
    blueprints: new Map(
      lessonBlueprints.map((rawLesson, index) => {
        const lesson = asRecord(rawLesson, `lessonBlueprints[${index}]`)
        const slug = asString(
          getRequiredRecordValue(lesson, 'slug'),
          `lessonBlueprints[${index}].slug`,
        )
        return [
          slug,
          {
            slug,
            title: asOptionalString(lesson.title),
            summary: asOptionalString(lesson.summary),
            moduleId: asString(
              getRequiredRecordValue(lesson, 'moduleId'),
              `${slug}.moduleId`,
            ),
            milestoneId: asString(
              getRequiredRecordValue(lesson, 'milestoneId'),
              `${slug}.milestoneId`,
            ),
            minutes: asNumber(
              getRequiredRecordValue(lesson, 'minutes'),
              `${slug}.minutes`,
            ),
            whyThisMatters: asOptionalString(lesson.whyThisMatters),
            howToDo: asOptionalString(lesson.howToDo),
            commonBlockers: asOptionalString(lesson.commonBlockers),
            confirmationMethod: asOptionalString(lesson.confirmationMethod),
            prerequisites: asStringArray(
              getRequiredRecordValue(lesson, 'prerequisites'),
              `${slug}.prerequisites`,
            ),
            goalTags: asStringArray(
              getRequiredRecordValue(lesson, 'goalTags'),
              `${slug}.goalTags`,
            ),
            capabilityTags: asStringArray(
              getRequiredRecordValue(lesson, 'capabilityTags'),
              `${slug}.capabilityTags`,
            ),
            blockerTags: asStringArray(
              getRequiredRecordValue(lesson, 'blockerTags'),
              `${slug}.blockerTags`,
            ),
            personaTags: asOptionalStringArray(lesson.personaTags),
          },
        ] satisfies [string, LegacyBlueprint]
      }),
    ),
  }
}

async function readTypeScriptFile(filePath: string): Promise<ts.SourceFile> {
  const source = await readFile(filePath, 'utf8')
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
}

function getVariableInitializer(
  sourceFile: ts.SourceFile,
  variableName: string,
): ts.Expression {
  let match: ts.Expression | null = null

  const visit = (node: ts.Node) => {
    if (match) {
      return
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === variableName && node.initializer) {
        match = node.initializer
        return
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  if (!match) {
    throw new Error(
      `Legacy import could not find variable "${variableName}" in ${sourceFile.fileName}`,
    )
  }

  return match
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(node)) {
    return unwrapExpression(node.expression)
  }

  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return unwrapExpression(node.expression)
  }

  return node
}

function getObjectLiteralStringProperty(
  node: ts.Expression,
  propertyName: string,
  fallback: string,
): string {
  const expression = unwrapExpression(node)
  if (!ts.isObjectLiteralExpression(expression)) {
    return fallback
  }

  const property = expression.properties.find((candidate) => {
    if (!ts.isPropertyAssignment(candidate)) {
      return false
    }

    return getPropertyName(candidate.name) === propertyName
  })

  if (!property || !ts.isPropertyAssignment(property)) {
    return fallback
  }

  const value = evaluateNode(property.initializer)
  return typeof value === 'string' ? value : fallback
}

function evaluateNode(node: ts.Expression): AstValue {
  const expression = unwrapExpression(node)

  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text
  }

  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text)
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return true
  }

  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return false
  }

  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return null
  }

  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.map((element) => {
      if (!ts.isExpression(element)) {
        throw new Error(
          `Legacy import does not support spread elements in arrays (${expression.getText()})`,
        )
      }

      return evaluateNode(element)
    })
  }

  if (ts.isObjectLiteralExpression(expression)) {
    const value: Record<string, AstValue> = {}

    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) {
        throw new Error(
          `Legacy import does not support object property ${property.getText()}`,
        )
      }

      const propertyName = getPropertyName(property.name)
      value[propertyName] = evaluateNode(property.initializer)
    }

    return value
  }

  if (ts.isCallExpression(expression)) {
    if (
      ts.isPropertyAccessExpression(expression.expression) &&
      expression.expression.name.text === 'join' &&
      expression.arguments.length === 1
    ) {
      const [delimiterNode] = expression.arguments
      if (!delimiterNode) {
        throw new Error('Legacy import could not evaluate join() without a delimiter')
      }

      const receiver = evaluateNode(expression.expression.expression)
      const delimiter = evaluateNode(delimiterNode)
      const items = asArray(receiver, 'join.receiver').map((item) =>
        asString(item, 'join.receiver.item'),
      )
      return items.join(asString(delimiter, 'join.delimiter'))
    }
  }

  throw new Error(
    `Legacy import cannot evaluate AST node ${ts.SyntaxKind[expression.kind]}: ${expression.getText()}`,
  )
}

function getPropertyName(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }

  throw new Error(`Legacy import does not support property name ${name.getText()}`)
}

function asRecord(value: AstValue, label: string): Record<string, AstValue> {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return value
  }

  throw new Error(`Legacy import expected ${label} to be an object`)
}

function asArray(value: AstValue, label: string): AstValue[] {
  if (Array.isArray(value)) {
    return value
  }

  throw new Error(`Legacy import expected ${label} to be an array`)
}

function asString(value: AstValue, label: string): string {
  if (typeof value === 'string') {
    return value
  }

  throw new Error(`Legacy import expected ${label} to be a string`)
}

function asOptionalString(value: AstValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: AstValue, label: string): number {
  if (typeof value === 'number') {
    return value
  }

  throw new Error(`Legacy import expected ${label} to be a number`)
}

function asStringArray(value: AstValue | undefined, label: string): string[] {
  if (value === undefined) {
    return []
  }

  return asArray(value, label).map((item) => asString(item, `${label}[]`))
}

function asOptionalStringArray(value: AstValue | undefined): string[] {
  return value === undefined ? [] : asStringArray(value, 'optionalStringArray')
}

function getRequiredRecordValue(
  record: Record<string, AstValue>,
  key: string,
): AstValue {
  const value = record[key]
  if (value === undefined) {
    throw new Error(`Legacy import expected object key "${key}" to exist`)
  }

  return value
}

function slugFromLegacyLessonId(legacyId: string): string {
  const match = legacyId.match(/^lesson_web_builder_\d{3}_(.+)$/)
  if (!match?.[1]) {
    throw new Error(`Legacy import could not parse lesson slug from ${legacyId}`)
  }

  return match[1].replaceAll('_', '-')
}

function atomIdFromLegacyLessonId(legacyId: string): string {
  return `atom.web-builder.${slugFromLegacyLessonId(legacyId)}`
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath)
    return fileStat.isFile()
  } catch {
    return false
  }
}
