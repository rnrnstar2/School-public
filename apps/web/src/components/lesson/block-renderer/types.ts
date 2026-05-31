// ============================================
// Block content type definitions for each LessonBlockType
// ============================================

export interface MarkdownBlockContent {
  text: string
}

export interface ImageBlockContent {
  src: string
  alt: string
  caption?: string
  width?: number
  height?: number
}

export interface VideoBlockContent {
  src: string
  poster?: string
  caption?: string
}

export interface ChecklistBlockContent {
  items: { id: string; label: string; required: boolean }[]
}

export interface QuizBlockContent {
  question: string
  options: { id: string; text: string; correct: boolean }[]
  explanation?: string
}

export interface CodePromptBlockContent {
  language: string
  prompt: string
  starterCode?: string
  solution?: string
}

export interface ReflectionBlockContent {
  prompt: string
  minLength?: number
}

export interface RubricBlockContent {
  criteria: { label: string; description: string }[]
}

export interface CalloutBlockContent {
  variant: 'info' | 'warning' | 'tip' | 'why'
  text: string
}

export interface ArtifactSubmitBlockContent {
  prompt: string
  acceptedTypes: string[]
}

// Union type for all block content shapes
export type BlockContent =
  | MarkdownBlockContent
  | ImageBlockContent
  | VideoBlockContent
  | ChecklistBlockContent
  | QuizBlockContent
  | CodePromptBlockContent
  | ReflectionBlockContent
  | RubricBlockContent
  | CalloutBlockContent
  | ArtifactSubmitBlockContent
