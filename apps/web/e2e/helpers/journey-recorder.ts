import type { Page } from '@playwright/test'
import type { PersonaDefinition } from './persona'

export interface JourneyReport {
  steps: number
  durationMs: number
  aiFrictionEvents: number
  blockedTransitions: string[]
  recordedSelectors: string[]
  criteriaViolations: string[]
}

interface RecorderSnapshot {
  clickCount: number
  blockedTransitions: string[]
  recordedSelectors: string[]
  aiFrictionEvents: number
}

const JOURNEY_RECORDER_INIT = () => {
  const win = window as Window & {
    __journeyRecorderState?: {
      clickCount: number
      blockedTransitions: string[]
      recordedSelectors: string[]
      installed: boolean
    }
    __journeyMetrics?: {
      hearingTurns: number
      frictionEvents: number
    }
  }

  if (win.__journeyRecorderState?.installed) {
    return
  }

  const state = {
    clickCount: 0,
    blockedTransitions: [] as string[],
    recordedSelectors: [] as string[],
    installed: true,
  }
  const recordedSelectors = new Set<string>()

  const isVisible = (element: Element) => {
    const htmlElement = element as HTMLElement
    const style = window.getComputedStyle(htmlElement)
    const rect = htmlElement.getBoundingClientRect()

    return !htmlElement.hidden
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width > 0
      && rect.height > 0
  }

  const recordVisibleSelectors = () => {
    for (const element of document.querySelectorAll('[data-testid]')) {
      const value = element.getAttribute('data-testid')
      if (!value || !isVisible(element)) {
        continue
      }

      recordedSelectors.add(`[data-testid="${value}"]`)
    }

    state.recordedSelectors = [...recordedSelectors]
  }

  document.addEventListener(
    'click',
    (event) => {
      state.clickCount += 1

      const target = event.target instanceof Element
        ? event.target.closest('button, a, [role="button"], input, textarea, [data-testid]')
        : null

      if (target instanceof HTMLElement) {
        const isBlocked = target.matches(':disabled') || target.getAttribute('aria-disabled') === 'true'
        if (isBlocked) {
          const marker = target.getAttribute('data-testid')
            ?? target.getAttribute('aria-label')
            ?? target.textContent?.trim()
            ?? target.tagName.toLowerCase()
          state.blockedTransitions.push(marker)
        }
      }

      queueMicrotask(recordVisibleSelectors)
    },
    true,
  )

  const observer = new MutationObserver(recordVisibleSelectors)
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-testid', 'class', 'style', 'hidden', 'aria-hidden'],
  })

  win.addEventListener('load', recordVisibleSelectors, { once: true })
  recordVisibleSelectors()
  win.__journeyRecorderState = state
}

function evaluateRecorderSnapshot() {
  const win = window as Window & {
    __journeyRecorderState?: {
      clickCount: number
      blockedTransitions: string[]
      recordedSelectors: string[]
    }
    __journeyMetrics?: {
      frictionEvents: number
    }
  }

  return {
    clickCount: win.__journeyRecorderState?.clickCount ?? 0,
    blockedTransitions: win.__journeyRecorderState?.blockedTransitions ?? [],
    recordedSelectors: win.__journeyRecorderState?.recordedSelectors ?? [],
    aiFrictionEvents: win.__journeyMetrics?.frictionEvents ?? 0,
  } satisfies RecorderSnapshot
}

export function startJourneyRecorder(
  page: Page,
  persona: PersonaDefinition,
) {
  const startedAt = Date.now()
  let navigationCount = 0

  const handleFrameNavigated = () => {
    const currentUrl = page.url()
    if (!currentUrl || currentUrl === 'about:blank') {
      return
    }
    navigationCount += 1
  }

  void page.addInitScript(JOURNEY_RECORDER_INIT)
  void page.evaluate(JOURNEY_RECORDER_INIT).catch(() => undefined)
  page.on('framenavigated', handleFrameNavigated)

  return {
    async finish(): Promise<JourneyReport> {
      page.off('framenavigated', handleFrameNavigated)

      const snapshot = await page.evaluate(evaluateRecorderSnapshot).catch<RecorderSnapshot>(() => ({
        clickCount: 0,
        blockedTransitions: [],
        recordedSelectors: [],
        aiFrictionEvents: 0,
      }))
      const durationMs = Date.now() - startedAt
      const steps = snapshot.clickCount + navigationCount
      const criteriaViolations: string[] = []

      if (steps > persona.successCriteria.maxStepsToFirstLesson) {
        criteriaViolations.push('steps_exceeded')
      }

      if (durationMs > persona.successCriteria.maxDurationMs) {
        criteriaViolations.push('duration_exceeded')
      }

      if (snapshot.aiFrictionEvents > persona.successCriteria.maxAiFrictionEvents) {
        criteriaViolations.push('ai_friction_exceeded')
      }

      if (
        persona.successCriteria.requiresNoCode
        && snapshot.recordedSelectors.some((selector) => /\[data-testid="code-[^"]+"\]/.test(selector))
      ) {
        criteriaViolations.push('code_input_present')
      }

      return {
        steps,
        durationMs,
        aiFrictionEvents: snapshot.aiFrictionEvents,
        blockedTransitions: snapshot.blockedTransitions,
        recordedSelectors: snapshot.recordedSelectors,
        criteriaViolations,
      }
    },
  }
}
