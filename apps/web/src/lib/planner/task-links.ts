export interface PlannerTaskRouteContext {
  goal?: string | null
  trackId?: string | null
  taskId?: string | null
  stepId?: string | null
}

function buildPlannerTaskQuery(context: PlannerTaskRouteContext) {
  const params = new URLSearchParams()

  if (context.goal?.trim()) {
    params.set('goal', context.goal.trim())
  }

  if (context.trackId?.trim()) {
    params.set('trackId', context.trackId.trim())
  }

  if (context.taskId?.trim()) {
    params.set('taskId', context.taskId.trim())
  }

  if (context.stepId?.trim()) {
    params.set('stepId', context.stepId.trim())
  }

  return params.toString()
}

export function buildPlanHref() {
  return '/plan'
}

export function buildLessonHref(lessonId: string, context: PlannerTaskRouteContext = {}) {
  const query = buildPlannerTaskQuery(context)
  return query ? `/lessons/${lessonId}?${query}` : `/lessons/${lessonId}`
}

export function buildLessonLibraryHref(context: PlannerTaskRouteContext = {}) {
  const query = buildPlannerTaskQuery(context)
  return query ? `/lessons?${query}` : '/lessons'
}
