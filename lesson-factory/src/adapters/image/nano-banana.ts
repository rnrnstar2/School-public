import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { GoogleGenAI } from '@google/genai'

import type { ImageAdapter } from '../base.js'
import { fromRepoRelativePath, getRepoRoot } from '../../core/paths.js'
import type { Asset, SceneSpec } from '../../core/types.js'

const MODEL_ID = 'gemini-3.1-flash-image-preview'
const SOURCE_ADAPTER = 'nano-banana'

export function createNanoBananaImageAdapter(): ImageAdapter {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENAI_API_KEY

  if (!apiKey) {
    throw new Error('Missing Gemini API key. export GEMINI_API_KEY=your_api_key')
  }

  const ai = new GoogleGenAI({ apiKey })
  const slotIterations = new Map<string, number>()

  return {
    async generate(spec: SceneSpec): Promise<Asset> {
      const prompt = buildPrompt(spec)
      const iteration = await reserveSlotIteration(spec, slotIterations)
      const filePath = buildOutputPath(spec, iteration)
      const absolutePath = fromRepoRelativePath(filePath)

      if (!spec.dry_run) {
        const imageData = await generateInlineImageData(ai, prompt, spec)
        const imageBuffer = Buffer.from(imageData, 'base64')

        await mkdir(path.dirname(absolutePath), { recursive: true })
        await writeFile(absolutePath, imageBuffer)
        await writeWebPublicCopy(spec, iteration, imageBuffer)
      }

      return {
        asset_id: buildAssetId(spec, iteration),
        type: 'image',
        source_adapter: SOURCE_ADAPTER,
        source_model: MODEL_ID,
        prompt_used: prompt,
        file_path: filePath,
        metadata: {
          lesson_id: spec.lesson_id,
          slot: spec.slot,
          mime_type: 'image/png',
        },
        created_at: new Date().toISOString(),
      }
    },

    async edit(assetId: string, instruction: string): Promise<Asset> {
      return {
        asset_id: assetId,
        type: 'image',
        source_adapter: SOURCE_ADAPTER,
        source_model: MODEL_ID,
        prompt_used: instruction,
        file_path: `lesson-factory/assets/images/${assetId.replace(/^asset\./, '')}.edited.png`,
        metadata: {
          edited: true,
        },
        created_at: new Date().toISOString(),
      }
    },
  }
}

function buildPrompt(spec: SceneSpec): string {
  return [
    'Create a single 1200x675 PNG image for this lesson asset.',
    `Lesson ID: ${spec.lesson_id}`,
    `Slot: ${spec.slot}`,
    `Brief: ${spec.prompt}`,
  ].join('\n')
}

function buildOutputPath(spec: SceneSpec, iteration = 1): string {
  const suffix = iteration === 1 ? '' : `.${iteration}`
  return path
    .join('lesson-factory', 'assets', 'images', spec.lesson_id, `${spec.slot}${suffix}.png`)
    .replace(/\\/g, '/')
}

function buildAssetId(spec: SceneSpec, iteration = 1): string {
  const suffix = iteration === 1 ? '' : `.${iteration}`
  return `asset.${spec.lesson_id.replace(/^atom\./, '')}.${spec.slot.replaceAll('_', '-')}${suffix}`
}

function buildWebPublicOutputPath(spec: SceneSpec, iteration = 1): string {
  return path.join(
    getRepoRoot(),
    'apps',
    'web',
    'public',
    'lesson-assets',
    spec.lesson_id,
    path.basename(buildOutputPath(spec, iteration)),
  )
}

async function writeWebPublicCopy(
  spec: SceneSpec,
  iteration: number,
  imageBuffer: Buffer,
): Promise<void> {
  const publicOutputPath = buildWebPublicOutputPath(spec, iteration)

  try {
    await mkdir(path.dirname(publicOutputPath), { recursive: true })
    await writeFile(publicOutputPath, imageBuffer)
  } catch (error) {
    console.warn(
      `Warning: Failed to mirror generated image to ${publicOutputPath}.`,
      error,
    )
  }
}

async function reserveSlotIteration(
  spec: SceneSpec,
  slotIterations: Map<string, number>,
): Promise<number> {
  const key = `${spec.lesson_id}:${spec.slot}`
  const previousIteration = slotIterations.get(key)

  if (previousIteration != null) {
    const nextIteration = previousIteration + 1
    slotIterations.set(key, nextIteration)
    return nextIteration
  }

  let iteration = 1

  while (true) {
    const absolutePath = fromRepoRelativePath(buildOutputPath(spec, iteration))

    try {
      await readFile(absolutePath)
      iteration += 1
    } catch (error) {
      if (isMissingFileError(error)) {
        slotIterations.set(key, iteration)
        return iteration
      }

      throw error
    }
  }
}

async function generateInlineImageData(
  ai: GoogleGenAI,
  prompt: string,
  spec: SceneSpec,
): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents: prompt,
  })
  const imageData = findInlineImageData(response)

  if (imageData) {
    return imageData
  }

  await sleep(1000)

  const retryResponse = await ai.models.generateContent({
    model: MODEL_ID,
    contents: prompt,
  })

  return extractInlineImageData(retryResponse, spec)
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function findInlineImageData(response: {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          data?: string
        }
      }>
    }
  }>
}): string | null {
  const parts = response.candidates?.[0]?.content?.parts ?? []

  for (const part of parts) {
    const imageData = part.inlineData?.data
    if (imageData) {
      return imageData
    }
  }

  return null
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function extractInlineImageData(response: {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          data?: string
        }
      }>
    }
  }>
}, spec: SceneSpec): string {
  const imageData = findInlineImageData(response)
  if (imageData) {
    return imageData
  }

  throw new Error(
    `Nano Banana returned no inlineData for lesson ${spec.lesson_id} slot ${spec.slot}.`,
  )
}
