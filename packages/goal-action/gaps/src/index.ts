export { DEFAULT_THRESHOLDS } from './defaults'
export { detectGaps, type DetectGapsInput } from './detect'
export {
  persistGaps,
  type LessonGapPersistClient,
  type LessonGapPersistInsert,
  type LessonGapPersistRow,
  type PersistGapsResult,
} from './persist'
export {
  GapAxisSchema,
  GapEvidenceSchema,
  GapReasonComparatorSchema,
  GapReasonSchema,
  GapThresholdsInputSchema,
  GapThresholdsSchema,
  LessonGapSchema,
  LessonGapStatusSchema,
  type GapAxis,
  type GapCanonicalAction,
  type GapEvidence,
  type GapReason,
  type GapReasonComparator,
  type GapThresholds,
  type GapThresholdsInput,
  type GapTopMapping,
  type LessonGap,
  type LessonGapStatus,
} from './schema'
