import path from 'node:path'
import { readFile } from 'node:fs/promises'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { withTempLessonFactory } from '../helpers.js'

const { GoogleGenAIMock, generateContentMock } = vi.hoisted(() => ({
  GoogleGenAIMock: vi.fn(),
  generateContentMock: vi.fn(),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class GoogleGenAI {
    readonly models = {
      generateContent: generateContentMock,
    }

    constructor(options: unknown) {
      GoogleGenAIMock(options)
    }
  },
}))

import { createNanoBananaImageAdapter } from '../../src/adapters/image/nano-banana.js'

describe('nano banana image adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_GENAI_API_KEY
  })

  it('passes the expected model and writes a PNG to the nested asset path', async () => {
    await withTempLessonFactory(async ({ repoRoot }) => {
      process.env.GEMINI_API_KEY = 'test-gemini-key'
      const pngBytes = Buffer.from('fake-png-binary')

      generateContentMock.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: pngBytes.toString('base64'),
                    mimeType: 'image/png',
                  },
                },
              ],
            },
          },
        ],
      })

      const adapter = createNanoBananaImageAdapter()
      const asset = await adapter.generate({
        run_id: 'run.test.nano-banana',
        lesson_id: 'atom.test.nano-banana',
        slot: 'diagram',
        prompt: 'Draw a clean educational diagram.',
        output_path: 'lesson-factory/assets/images/ignored.svg',
        instruction: 'unused by adapter',
      })

      expect(GoogleGenAIMock).toHaveBeenCalledWith({
        apiKey: 'test-gemini-key',
      })
      expect(generateContentMock).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image-preview',
        contents: expect.stringContaining('Brief: Draw a clean educational diagram.'),
      })
      expect(asset.file_path).toBe('lesson-factory/assets/images/atom.test.nano-banana/diagram.png')

      const written = await readFile(path.join(repoRoot, asset.file_path))
      expect(written).toEqual(pngBytes)
    })
  })

  it('throws a clear error when no Gemini API key is configured', () => {
    expect(() => createNanoBananaImageAdapter()).toThrow(
      'Missing Gemini API key. export GEMINI_API_KEY=your_api_key',
    )
  })
})
