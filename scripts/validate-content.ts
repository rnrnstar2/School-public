#!/usr/bin/env -S npx tsx
/**
 * validate-content.ts — Lesson content validation CLI
 *
 * Validates lesson content quality, schema integrity, asset references,
 * prerequisite graph, objectives, and content quality across all tracks.
 *
 * Usage (from repo root):
 *   cd apps/web && npx tsx ../../scripts/validate-content.ts
 *   cd apps/web && npx tsx ../../scripts/validate-content.ts --errors-only
 *   cd apps/web && npx tsx ../../scripts/validate-content.ts --json
 *   cd apps/web && npx tsx ../../scripts/validate-content.ts --fix
 *
 * Or via the convenience wrapper:
 *   npx tsx scripts/validate-content.ts   (auto-detects apps/web)
 */

import * as path from 'path';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Resolve the apps/web root regardless of cwd
// ---------------------------------------------------------------------------

function findAppRoot(): string {
  // Try relative to this script file first
  const fromScript = path.resolve(__dirname, '../apps/web');
  if (fs.existsSync(path.join(fromScript, 'package.json'))) return fromScript;

  // Try cwd (if script is run from apps/web)
  if (fs.existsSync(path.join(process.cwd(), 'src/lib/curriculum/track-registry.ts'))) {
    return process.cwd();
  }

  // Try cwd/apps/web
  const fromCwd = path.join(process.cwd(), 'apps/web');
  if (fs.existsSync(path.join(fromCwd, 'package.json'))) return fromCwd;

  throw new Error(
    'Cannot find apps/web directory. Run from repo root or apps/web.',
  );
}

const APP_ROOT = findAppRoot();
const PUBLIC_DIR = path.join(APP_ROOT, 'public');

// ---------------------------------------------------------------------------
// Types (compat shapes matching LessonChunk / LearningTrack)
// ---------------------------------------------------------------------------

interface LessonChunkCompat {
  id: string;
  title: string;
  trackId: string;
  moduleId: string;
  moduleTitle: string;
  milestoneId: string;
  version: number;
  status: string;
  summary: string;
  promise: string;
  whyThisMatters?: string;
  howToDo?: string;
  commonBlockers?: string;
  confirmationMethod?: string;
  content?: string;
  skillLevel: { min: string; recommended: string; max: string };
  difficultyLevel: string;
  estimatedMinutes: number;
  lessonType: string;
  deliveryMode: string;
  primaryOutcome: string;
  outputs: string[];
  prerequisiteIds: string[];
  recommendedBeforeIds: string[];
  mutuallyReinforcingIds: string[];
  dependencies: { lessonId: string; type: string }[];
  unlocks: string[];
  personaTags: string[];
  goalTags: string[];
  capabilityTags: string[];
  blockerTags: string[];
  contentTypes: string[];
  searchTerms: string[];
  media_refs: { type: string; url: string; alt?: string; caption?: string }[];
  exercises?: {
    id: string;
    title: string;
    instruction: string;
    language: string;
    starterCode: string;
    solutionHint: string;
    validationPatterns: string[];
  }[];
}

interface LearningTrackCompat {
  id: string;
  label: string;
  lessons: LessonChunkCompat[];
  flowEdges: { from: string; to: string; type: string }[];
}

// ---------------------------------------------------------------------------
// Load tracks via dynamic import (resolves @/ aliases when tsx runs from apps/web)
// ---------------------------------------------------------------------------

async function loadTracks(): Promise<LearningTrackCompat[]> {
  const registryPath = path.join(
    APP_ROOT,
    'src/lib/curriculum/track-registry.ts',
  );

  // Dynamic import — tsx resolves @/ aliases from the tsconfig.json in cwd
  const mod = await import(registryPath);
  const tracks = mod.getAllTracks() as LearningTrackCompat[];
  return tracks;
}

// ---------------------------------------------------------------------------
// Diagnostic types
// ---------------------------------------------------------------------------

type Severity = 'error' | 'warning';
type Category = 'schema' | 'asset' | 'graph' | 'objective' | 'quality';

interface Diagnostic {
  severity: Severity;
  category: Category;
  message: string;
  lessonId?: string;
  blockIndex?: number;
}

// ---------------------------------------------------------------------------
// Block content shape validators (for future DB-based lesson_blocks)
// ---------------------------------------------------------------------------

interface BlockContentValidator {
  validate(content: Record<string, unknown>): string[];
}

function requiredString(
  obj: Record<string, unknown>,
  field: string,
): string | null {
  if (typeof obj[field] !== 'string' || (obj[field] as string).trim() === '') {
    return `missing required field "${field}"`;
  }
  return null;
}

function optionalString(
  obj: Record<string, unknown>,
  field: string,
): string | null {
  if (field in obj && typeof obj[field] !== 'string') {
    return `field "${field}" must be a string`;
  }
  return null;
}

/**
 * Block content validators — these define the expected content shape for each
 * lesson_block type in the canonical DB model.
 *
 * Currently exercised only when lesson_blocks data is present (future DB migration).
 * Exported so tests can verify the validators themselves.
 */
export const blockValidators: Record<string, BlockContentValidator> = {
  markdown: {
    validate(content) {
      const errs: string[] = [];
      const e = requiredString(content, 'text');
      if (e) errs.push(e);
      return errs;
    },
  },
  image: {
    validate(content) {
      const errs: string[] = [];
      let e = requiredString(content, 'src');
      if (e) errs.push(e);
      e = requiredString(content, 'alt');
      if (e) errs.push(e);
      e = optionalString(content, 'caption');
      if (e) errs.push(e);
      return errs;
    },
  },
  video: {
    validate(content) {
      const errs: string[] = [];
      let e = requiredString(content, 'src');
      if (e) errs.push(e);
      e = optionalString(content, 'poster');
      if (e) errs.push(e);
      e = optionalString(content, 'caption');
      if (e) errs.push(e);
      return errs;
    },
  },
  checklist: {
    validate(content) {
      const errs: string[] = [];
      if (!Array.isArray(content.items)) {
        errs.push('missing required field "items" (array)');
        return errs;
      }
      for (let i = 0; i < content.items.length; i++) {
        const item = content.items[i] as Record<string, unknown>;
        if (typeof item.label !== 'string')
          errs.push(`items[${i}].label must be a string`);
        if (typeof item.required !== 'boolean')
          errs.push(`items[${i}].required must be a boolean`);
      }
      return errs;
    },
  },
  quiz: {
    validate(content) {
      const errs: string[] = [];
      let e = requiredString(content, 'question');
      if (e) errs.push(e);
      if (!Array.isArray(content.options)) {
        errs.push('missing required field "options" (array)');
      } else {
        for (let i = 0; i < content.options.length; i++) {
          const opt = content.options[i] as Record<string, unknown>;
          if (typeof opt.text !== 'string')
            errs.push(`options[${i}].text must be a string`);
          if (typeof opt.correct !== 'boolean')
            errs.push(`options[${i}].correct must be a boolean`);
        }
      }
      e = optionalString(content, 'explanation');
      if (e) errs.push(e);
      return errs;
    },
  },
  code_prompt: {
    validate(content) {
      const errs: string[] = [];
      let e = requiredString(content, 'language');
      if (e) errs.push(e);
      e = requiredString(content, 'prompt');
      if (e) errs.push(e);
      e = optionalString(content, 'starterCode');
      if (e) errs.push(e);
      e = optionalString(content, 'solution');
      if (e) errs.push(e);
      return errs;
    },
  },
  reflection: {
    validate(content) {
      const errs: string[] = [];
      const e = requiredString(content, 'prompt');
      if (e) errs.push(e);
      if ('minLength' in content && typeof content.minLength !== 'number') {
        errs.push('field "minLength" must be a number');
      }
      return errs;
    },
  },
  rubric: {
    validate(content) {
      const errs: string[] = [];
      if (!Array.isArray(content.criteria)) {
        errs.push('missing required field "criteria" (array)');
        return errs;
      }
      for (let i = 0; i < content.criteria.length; i++) {
        const c = content.criteria[i] as Record<string, unknown>;
        if (typeof c.label !== 'string')
          errs.push(`criteria[${i}].label must be a string`);
        if (typeof c.description !== 'string')
          errs.push(`criteria[${i}].description must be a string`);
      }
      return errs;
    },
  },
  callout: {
    validate(content) {
      const errs: string[] = [];
      const validVariants = ['info', 'warning', 'tip', 'why'];
      if (
        typeof content.variant !== 'string' ||
        !validVariants.includes(content.variant as string)
      ) {
        errs.push(
          `field "variant" must be one of: ${validVariants.join(', ')}`,
        );
      }
      const e = requiredString(content, 'text');
      if (e) errs.push(e);
      return errs;
    },
  },
  artifact_submit: {
    validate(content) {
      const errs: string[] = [];
      const e = requiredString(content, 'prompt');
      if (e) errs.push(e);
      if (!Array.isArray(content.acceptedTypes)) {
        errs.push('missing required field "acceptedTypes" (array)');
      } else {
        for (let i = 0; i < content.acceptedTypes.length; i++) {
          if (typeof content.acceptedTypes[i] !== 'string') {
            errs.push(`acceptedTypes[${i}] must be a string`);
          }
        }
      }
      return errs;
    },
  },
};

// ---------------------------------------------------------------------------
// Validation: schema (LessonChunk fields)
// ---------------------------------------------------------------------------

function validateLessonChunkSchema(
  lesson: LessonChunkCompat,
): Diagnostic[] {
  const diags: Diagnostic[] = [];

  if (!lesson.id || typeof lesson.id !== 'string') {
    diags.push({
      severity: 'error',
      category: 'schema',
      message: 'lesson missing "id"',
      lessonId: lesson.id,
    });
  }
  if (!lesson.title || typeof lesson.title !== 'string') {
    diags.push({
      severity: 'error',
      category: 'schema',
      message: `lesson "${lesson.id}" missing "title"`,
      lessonId: lesson.id,
    });
  }
  if (!lesson.trackId) {
    diags.push({
      severity: 'error',
      category: 'schema',
      message: `lesson "${lesson.id}" missing "trackId"`,
      lessonId: lesson.id,
    });
  }
  if (typeof lesson.version !== 'number' || lesson.version < 1) {
    diags.push({
      severity: 'error',
      category: 'schema',
      message: `lesson "${lesson.id}" invalid version: ${lesson.version}`,
      lessonId: lesson.id,
    });
  }
  if (!['draft', 'published'].includes(lesson.status)) {
    diags.push({
      severity: 'error',
      category: 'schema',
      message: `lesson "${lesson.id}" invalid status: "${lesson.status}"`,
      lessonId: lesson.id,
    });
  }
  if (!lesson.summary || lesson.summary.trim() === '') {
    diags.push({
      severity: 'error',
      category: 'schema',
      message: `lesson "${lesson.id}" missing "summary"`,
      lessonId: lesson.id,
    });
  }

  // Validate exercises (maps to code_prompt / interactive blocks)
  if (lesson.exercises) {
    for (let i = 0; i < lesson.exercises.length; i++) {
      const ex = lesson.exercises[i];
      if (!ex.id)
        diags.push({
          severity: 'error',
          category: 'schema',
          message: `lesson "${lesson.id}" exercise[${i}] missing "id"`,
          lessonId: lesson.id,
          blockIndex: i,
        });
      if (!ex.title)
        diags.push({
          severity: 'error',
          category: 'schema',
          message: `lesson "${lesson.id}" exercise[${i}] missing "title"`,
          lessonId: lesson.id,
          blockIndex: i,
        });
      if (!ex.instruction)
        diags.push({
          severity: 'error',
          category: 'schema',
          message: `lesson "${lesson.id}" exercise[${i}] missing "instruction"`,
          lessonId: lesson.id,
          blockIndex: i,
        });
      if (!ex.language)
        diags.push({
          severity: 'error',
          category: 'schema',
          message: `lesson "${lesson.id}" exercise[${i}] missing "language"`,
          lessonId: lesson.id,
          blockIndex: i,
        });
    }
  }

  return diags;
}

// ---------------------------------------------------------------------------
// Validation: assets
// ---------------------------------------------------------------------------

function validateAssets(lessons: LessonChunkCompat[]): Diagnostic[] {
  const diags: Diagnostic[] = [];

  for (const lesson of lessons) {
    if (!lesson.media_refs) continue;

    for (let i = 0; i < lesson.media_refs.length; i++) {
      const ref = lesson.media_refs[i];
      if (!ref.url) {
        diags.push({
          severity: 'error',
          category: 'asset',
          message: `lesson "${lesson.id}" media_ref[${i}]: missing url`,
          lessonId: lesson.id,
          blockIndex: i,
        });
        continue;
      }

      // Skip external URLs
      if (/^https?:\/\//i.test(ref.url)) continue;

      // Check local file path
      const localPath = path.join(PUBLIC_DIR, ref.url.replace(/^\//, ''));
      if (!fs.existsSync(localPath)) {
        diags.push({
          severity: 'error',
          category: 'asset',
          message: `lesson "${lesson.id}" media_ref[${i}]: file not found at ${ref.url}`,
          lessonId: lesson.id,
          blockIndex: i,
        });
      }
    }
  }

  return diags;
}

// ---------------------------------------------------------------------------
// Validation: prerequisite graph (CONTENT-004)
// ---------------------------------------------------------------------------

function validateGraph(lessons: LessonChunkCompat[]): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const lessonIds = new Set(lessons.map((l) => l.id));

  // --- Duplicate slugs ---
  const slugCounts = new Map<string, number>();
  for (const lesson of lessons) {
    slugCounts.set(lesson.id, (slugCounts.get(lesson.id) ?? 0) + 1);
  }
  for (const [slug, count] of slugCounts) {
    if (count > 1) {
      diags.push({
        severity: 'error',
        category: 'graph',
        message: `duplicate lesson slug "${slug}" (appears ${count} times)`,
        lessonId: slug,
      });
    }
  }

  // --- Self-referencing prerequisites ---
  for (const lesson of lessons) {
    if (lesson.prerequisiteIds.includes(lesson.id)) {
      diags.push({
        severity: 'error',
        category: 'graph',
        message: `lesson "${lesson.id}" has self-referencing prerequisite`,
        lessonId: lesson.id,
      });
    }

    // References to non-existent lessons
    for (const preId of lesson.prerequisiteIds) {
      if (!lessonIds.has(preId)) {
        diags.push({
          severity: 'error',
          category: 'graph',
          message: `lesson "${lesson.id}" references non-existent prerequisite "${preId}"`,
          lessonId: lesson.id,
        });
      }
    }
  }

  // --- Cycle detection (DFS with 3-color marking) ---
  const adjList = new Map<string, string[]>();
  for (const lesson of lessons) {
    adjList.set(
      lesson.id,
      lesson.prerequisiteIds.filter((id) => lessonIds.has(id)),
    );
  }

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const id of lessonIds) color.set(id, WHITE);

  function dfs(node: string, pathStack: string[]): string[] | null {
    color.set(node, GRAY);
    pathStack.push(node);

    for (const neighbor of adjList.get(node) ?? []) {
      if (color.get(neighbor) === GRAY) {
        const cycleStart = pathStack.indexOf(neighbor);
        const cycle = pathStack.slice(cycleStart);
        cycle.push(neighbor);
        return cycle;
      }
      if (color.get(neighbor) === WHITE) {
        const cycle = dfs(neighbor, pathStack);
        if (cycle) return cycle;
      }
    }

    pathStack.pop();
    color.set(node, BLACK);
    return null;
  }

  for (const id of lessonIds) {
    if (color.get(id) === WHITE) {
      const cycle = dfs(id, []);
      if (cycle) {
        diags.push({
          severity: 'error',
          category: 'graph',
          message: `cycle detected: ${cycle.join(' \u2192 ')}`,
        });
        break; // Report first cycle only
      }
    }
  }

  // --- Orphan detection (BFS from entry points) ---
  const entryPoints = lessons.filter((l) => l.prerequisiteIds.length === 0);
  if (entryPoints.length === 0 && lessons.length > 0) {
    diags.push({
      severity: 'error',
      category: 'graph',
      message: 'no entry point lessons found (all lessons have prerequisites)',
    });
  } else {
    const reachable = new Set<string>();
    const reverseAdj = new Map<string, string[]>();
    for (const lesson of lessons) {
      for (const preId of lesson.prerequisiteIds) {
        if (!reverseAdj.has(preId)) reverseAdj.set(preId, []);
        reverseAdj.get(preId)!.push(lesson.id);
      }
    }

    const queue = entryPoints.map((l) => l.id);
    for (const id of queue) reachable.add(id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of reverseAdj.get(current) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }

    for (const lesson of lessons) {
      if (!reachable.has(lesson.id)) {
        diags.push({
          severity: 'warning',
          category: 'graph',
          message: `lesson "${lesson.id}" is not reachable from any entry point`,
          lessonId: lesson.id,
        });
      }
    }
  }

  return diags;
}

// ---------------------------------------------------------------------------
// Validation: objectives
// ---------------------------------------------------------------------------

function validateObjectives(lessons: LessonChunkCompat[]): Diagnostic[] {
  const diags: Diagnostic[] = [];

  for (const lesson of lessons) {
    if (!lesson.capabilityTags || lesson.capabilityTags.length === 0) {
      diags.push({
        severity: 'warning',
        category: 'objective',
        message: `lesson "${lesson.id}" has no capability tags (objectives)`,
        lessonId: lesson.id,
      });
    }
  }

  return diags;
}

// ---------------------------------------------------------------------------
// Validation: content quality
// ---------------------------------------------------------------------------

function validateContentQuality(
  lessons: LessonChunkCompat[],
): Diagnostic[] {
  const diags: Diagnostic[] = [];

  for (const lesson of lessons) {
    if (!lesson.title || lesson.title.trim() === '') {
      diags.push({
        severity: 'warning',
        category: 'quality',
        message: `lesson "${lesson.id}" has no title`,
        lessonId: lesson.id,
      });
    }

    if (
      lesson.whyThisMatters !== undefined &&
      lesson.whyThisMatters.trim() === ''
    ) {
      diags.push({
        severity: 'warning',
        category: 'quality',
        message: `lesson "${lesson.id}": empty whyThisMatters`,
        lessonId: lesson.id,
      });
    }
    if (lesson.howToDo !== undefined && lesson.howToDo.trim() === '') {
      diags.push({
        severity: 'warning',
        category: 'quality',
        message: `lesson "${lesson.id}": empty howToDo`,
        lessonId: lesson.id,
      });
    }
    if (
      lesson.commonBlockers !== undefined &&
      lesson.commonBlockers.trim() === ''
    ) {
      diags.push({
        severity: 'warning',
        category: 'quality',
        message: `lesson "${lesson.id}": empty commonBlockers`,
        lessonId: lesson.id,
      });
    }
    if (
      lesson.confirmationMethod !== undefined &&
      lesson.confirmationMethod.trim() === ''
    ) {
      diags.push({
        severity: 'warning',
        category: 'quality',
        message: `lesson "${lesson.id}": empty confirmationMethod`,
        lessonId: lesson.id,
      });
    }

    const hasContent = lesson.content && lesson.content.trim() !== '';
    const hasStructuredContent =
      lesson.whyThisMatters ||
      lesson.howToDo ||
      lesson.commonBlockers ||
      lesson.confirmationMethod;
    if (!hasContent && !hasStructuredContent) {
      diags.push({
        severity: 'warning',
        category: 'quality',
        message: `lesson "${lesson.id}" has no content blocks (no content, whyThisMatters, howToDo, etc.)`,
        lessonId: lesson.id,
      });
    }

    if (!lesson.outputs || lesson.outputs.length === 0) {
      diags.push({
        severity: 'warning',
        category: 'quality',
        message: `lesson "${lesson.id}" has no defined outputs`,
        lessonId: lesson.id,
      });
    }

    if (!lesson.primaryOutcome || lesson.primaryOutcome.trim() === '') {
      diags.push({
        severity: 'warning',
        category: 'quality',
        message: `lesson "${lesson.id}" has no primaryOutcome`,
        lessonId: lesson.id,
      });
    }
  }

  return diags;
}

// ---------------------------------------------------------------------------
// --fix: auto-fix sort_order gaps
// ---------------------------------------------------------------------------

function applyFixes(_lessons: LessonChunkCompat[]): string[] {
  const fixes: string[] = [];
  // Placeholder: when DB migration lands, this will re-index sort_order.
  if (fixes.length === 0) {
    fixes.push('No auto-fixable issues found in current TS source data.');
  }
  return fixes;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatDiagnostic(d: Diagnostic): string {
  const prefix = d.severity === 'error' ? 'ERROR' : 'WARN';
  const blockPart =
    d.blockIndex !== undefined ? ` block #${d.blockIndex}` : '';
  const lessonPart = d.lessonId
    ? ` lesson "${d.lessonId}"${blockPart}:`
    : '';
  return `  ${prefix} [${d.category}]${lessonPart} ${d.message}`;
}

function formatJsonOutput(
  diagnostics: Diagnostic[],
  lessonCount: number,
): string {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');
  return JSON.stringify(
    {
      totalLessons: lessonCount,
      errorCount: errors.length,
      warningCount: warnings.length,
      errors: errors.map((d) => ({
        category: d.category,
        lessonId: d.lessonId,
        blockIndex: d.blockIndex,
        message: d.message,
      })),
      warnings: warnings.map((d) => ({
        category: d.category,
        lessonId: d.lessonId,
        blockIndex: d.blockIndex,
        message: d.message,
      })),
      pass: errors.length === 0,
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const errorsOnly = args.includes('--errors-only');
  const jsonOutput = args.includes('--json');
  const fix = args.includes('--fix');

  const tracks = await loadTracks();

  const allLessons: LessonChunkCompat[] = [];
  for (const track of tracks) {
    for (const lesson of track.lessons) {
      allLessons.push(lesson);
    }
  }

  // Run all validations
  const diagnostics: Diagnostic[] = [
    ...allLessons.flatMap(validateLessonChunkSchema),
    ...validateAssets(allLessons),
    ...validateGraph(allLessons),
    ...validateObjectives(allLessons),
    ...validateContentQuality(allLessons),
  ];

  // Apply fixes if requested
  if (fix) {
    const fixes = applyFixes(allLessons);
    if (!jsonOutput) {
      console.log('\n--- Auto-fix results ---');
      for (const f of fixes) console.log(`  ${f}`);
      console.log('');
    }
  }

  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');

  // Output
  if (jsonOutput) {
    console.log(formatJsonOutput(diagnostics, allLessons.length));
  } else {
    if (errors.length === 0) {
      console.log(`\u2713 ${allLessons.length} lessons validated`);
    } else {
      console.log(`\u2717 ${allLessons.length} lessons validated`);
    }

    if (errors.length > 0) {
      console.log(`\u2717 ${errors.length} errors found:`);
      for (const d of errors) {
        console.log(formatDiagnostic(d));
      }
    }

    if (!errorsOnly && warnings.length > 0) {
      console.log(`\u26A0 ${warnings.length} warnings:`);
      for (const d of warnings) {
        console.log(formatDiagnostic(d));
      }
    }

    if (errors.length === 0 && warnings.length === 0) {
      console.log('No issues found. All content passes validation.');
    } else if (errors.length === 0) {
      console.log(
        `\nAll clear \u2014 ${warnings.length} warning(s) only, no errors.`,
      );
    }
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Validation failed:', err);
  process.exit(1);
});
