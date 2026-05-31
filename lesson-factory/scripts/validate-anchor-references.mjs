#!/usr/bin/env node
/**
 * validate-anchor-references.mjs
 *
 * lesson-factory anchor yaml の参照整合性 lint。
 *
 * 検証項目:
 *  1. (既存) anchor.ordered_atom_ids[i] の atom yaml が実在すること。
 *  2. (W15 B2 / Codex Option A 追加) anchor.required_capabilities[i] が、
 *     対応する ordered_atom_ids[i] の atom yaml の capability_outputs に
 *     存在すること。一致しないと compile pipeline coverageScore が落ち、
 *     unsupportedCapabilities が膨らむ。
 *  3. (W15 B2 追加) required_capabilities.length === ordered_atom_ids.length
 *     を満たすこと (1:1 対応)。
 *
 * exit 0: GREEN / exit 1: RED (CI 用)。
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const atomsDir = path.join(root, 'lessons', 'atoms')
const anchorsDir = path.join(root, 'lessons', 'anchors')

export async function loadAtomMap(dir = atomsDir) {
  const map = new Map()
  for (const file of await readdir(dir)) {
    if (!file.endsWith('.yaml')) continue
    const id = file.slice(0, -5)
    const doc = yaml.load(await readFile(path.join(dir, file), 'utf8')) ?? {}
    const outputs = Array.isArray(doc.capability_outputs) ? doc.capability_outputs : []
    map.set(id, { capability_outputs: outputs })
  }
  return map
}

export async function validateAnchors({ anchorsDirectory = anchorsDir, atomsMap } = {}) {
  const errors = []
  const map = atomsMap ?? (await loadAtomMap())

  for (const file of (await readdir(anchorsDirectory)).filter((entry) => entry.endsWith('.yaml'))) {
    const anchor = yaml.load(await readFile(path.join(anchorsDirectory, file), 'utf8')) ?? {}
    const orderedAtomIds = Array.isArray(anchor.ordered_atom_ids) ? anchor.ordered_atom_ids : []
    const requiredCaps = Array.isArray(anchor.required_capabilities) ? anchor.required_capabilities : []

    // 1. atom existence
    for (const atomId of orderedAtomIds) {
      if (!map.has(atomId)) {
        errors.push(`lesson-factory/lessons/anchors/${file}: ordered_atom_ids -> ${atomId} (atom yaml not found)`)
      }
    }

    // 2. length 1:1
    if (requiredCaps.length !== orderedAtomIds.length) {
      errors.push(
        `lesson-factory/lessons/anchors/${file}: required_capabilities.length (${requiredCaps.length}) !== ordered_atom_ids.length (${orderedAtomIds.length})`,
      )
    }

    // 3. capability ↔ yaml capability_outputs 整合
    const max = Math.max(requiredCaps.length, orderedAtomIds.length)
    for (let i = 0; i < max; i++) {
      const cap = requiredCaps[i]
      const atomId = orderedAtomIds[i]
      if (!cap || !atomId) continue
      const atom = map.get(atomId)
      if (!atom) continue // already reported above
      if (!atom.capability_outputs.includes(cap)) {
        errors.push(
          `lesson-factory/lessons/anchors/${file}: required_capabilities[${i}] = "${cap}" not in ` +
            `${atomId}.capability_outputs (= ${atom.capability_outputs.join(', ') || '<empty>'})`,
        )
      }
    }
  }
  return errors
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const errors = await validateAnchors()
  if (errors.length > 0) {
    errors.forEach((line) => process.stderr.write(`${line}\n`))
    process.exit(1)
  }
}
