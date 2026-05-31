import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { VideoAdapter } from '../base.js'
import { fromRepoRelativePath } from '../../core/paths.js'
import type { Asset, VideoScript, VideoStyle } from '../../core/types.js'

export function createStubVideoAdapter(): VideoAdapter {
  return {
    async generate(script: VideoScript, style: VideoStyle): Promise<Asset> {
      const absolutePath = fromRepoRelativePath(script.output_path)
      if (!script.dry_run) {
        await mkdir(path.dirname(absolutePath), { recursive: true })
        await writeFile(
          absolutePath,
          [
            `lesson_id: ${script.lesson_id}`,
            `slot: ${script.slot}`,
            `format: ${style.format}`,
            `duration_seconds: ${style.duration_seconds}`,
            '',
            script.prompt,
          ].join('\n'),
          'utf8',
        )
      }

      return {
        asset_id: `asset.${script.lesson_id.replace(/^atom\./, '')}.${script.slot.replaceAll('_', '-')}`,
        type: 'video',
        source_adapter: 'stub-video',
        source_model: 'stub-video-v1',
        prompt_used: script.prompt,
        file_path: script.output_path.replace(/\\/g, '/'),
        metadata: {
          lesson_id: script.lesson_id,
          slot: script.slot,
          mime_type: 'text/plain',
          duration_seconds: style.duration_seconds,
        },
        created_at: new Date().toISOString(),
      }
    },
  }
}
