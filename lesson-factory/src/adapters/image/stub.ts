import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ImageAdapter } from '../base.js'
import { fromRepoRelativePath } from '../../core/paths.js'
import type { Asset, SceneSpec } from '../../core/types.js'

export function createStubImageAdapter(): ImageAdapter {
  return {
    async generate(spec: SceneSpec): Promise<Asset> {
      const absolutePath = fromRepoRelativePath(spec.output_path)
      if (!spec.dry_run) {
        await mkdir(path.dirname(absolutePath), { recursive: true })
        const svg = [
          '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675">',
          '<rect width="1200" height="675" fill="#f4f0e8" />',
          '<rect x="60" y="60" width="1080" height="555" rx="32" fill="#ffffff" stroke="#1d1d1d" />',
          `<text x="100" y="150" font-size="42" font-family="Verdana" fill="#1d1d1d">${spec.lesson_id}</text>`,
          `<text x="100" y="220" font-size="28" font-family="Verdana" fill="#4b4b4b">${spec.slot}</text>`,
          `<text x="100" y="320" font-size="24" font-family="Verdana" fill="#5b5b5b">${escapeXml(spec.prompt)}</text>`,
          '</svg>',
        ].join('')
        await writeFile(absolutePath, svg, 'utf8')
      }

      return {
        asset_id: `asset.${spec.lesson_id.replace(/^atom\./, '')}.${spec.slot.replaceAll('_', '-')}`,
        type: 'image',
        source_adapter: 'stub-image',
        source_model: 'stub-image-v1',
        prompt_used: spec.prompt,
        file_path: spec.output_path.replace(/\\/g, '/'),
        metadata: {
          lesson_id: spec.lesson_id,
          slot: spec.slot,
          mime_type: 'image/svg+xml',
          width: 1200,
          height: 675,
        },
        created_at: new Date().toISOString(),
      }
    },

    async edit(assetId: string, instruction: string): Promise<Asset> {
      return {
        asset_id: assetId,
        type: 'image',
        source_adapter: 'stub-image',
        source_model: 'stub-image-edit-v1',
        prompt_used: instruction,
        file_path: `lesson-factory/assets/images/${assetId.replace(/^asset\./, '')}.edited.svg`,
        metadata: {
          edited: true,
        },
        created_at: new Date().toISOString(),
      }
    },
  }
}

function escapeXml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
