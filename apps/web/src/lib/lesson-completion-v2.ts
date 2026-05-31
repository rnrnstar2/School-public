import {
  markLessonCompletedLocally,
  isLessonCompletedLocally,
  readLocallyCompletedLessonIds,
} from './lesson-completion'

/**
 * Lesson completion v2.
 *
 * Authenticated completion is handled through the atom-based lesson APIs.
 * This module only keeps the preview/local cache helpers that are still used
 * by the lesson UI.
 */

/**
 * Get completed lesson IDs from localStorage only.
 * Use for anonymous/preview users who are not authenticated.
 */
export function getLocalCompletedLessonIds(): string[] {
  return readLocallyCompletedLessonIds()
}

/**
 * Mark a lesson as complete in localStorage only.
 * Use for anonymous/preview users or as a cache update.
 */
export function setLocalLessonComplete(lessonId: string): void {
  markLessonCompletedLocally(lessonId)
}

/**
 * Check if a lesson is completed (localStorage check for fast hydration).
 */
export function isLessonCompleted(lessonId: string): boolean {
  return isLessonCompletedLocally(lessonId)
}
