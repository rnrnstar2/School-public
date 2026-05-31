import type {
  Asset,
  Critique,
  LessonDraft,
  LessonDraftInput,
  SceneSpec,
  VideoScript,
  VideoStyle,
} from '../core/types.js'

export interface DraftAdapter {
  draftLesson(input: LessonDraftInput): Promise<LessonDraft>
}

export interface CritiqueAdapter {
  critique(draft: LessonDraft): Promise<Critique>
}

export interface ImageAdapter {
  generate(spec: SceneSpec): Promise<Asset>
  edit(assetId: string, instruction: string): Promise<Asset>
}

export interface VideoAdapter {
  generate(script: VideoScript, style: VideoStyle): Promise<Asset>
}
