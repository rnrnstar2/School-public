export const ZAI_SNAPSHOT_MODES = [
  {
    mode: 'json_object',
    path: '/api/debug/zai-health?response_format=json_object',
  },
  {
    mode: 'text',
    path: '/api/debug/zai-health?response_format=text',
  },
  {
    mode: 'json_object_stream',
    path: '/api/debug/zai-health?response_format=json_object&stream=1',
  },
] as const

export type ZaiSnapshotMode = (typeof ZAI_SNAPSHOT_MODES)[number]['mode']

export type ZaiSnapshotEntry = {
  mode: ZaiSnapshotMode
  status: number | null
  latencyMs: number | null
  parsed: boolean
  requestId: string | null
  zaiRequestId: string | null
}

export type ZaiSnapshotOptions = {
  baseUrl: string
  fetch?: typeof fetch
}

type DebugZaiHealthBody = {
  status?: unknown
  latencyMs?: unknown
  parsed?: unknown
  requestId?: unknown
  zaiRequestId?: unknown
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim()

  if (!trimmed) {
    throw new Error('ZAI snapshot base URL is required.')
  }

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

async function readJsonBody(response: Response): Promise<DebugZaiHealthBody | null> {
  try {
    const body = await response.json()
    return body && typeof body === 'object' ? (body as DebugZaiHealthBody) : null
  } catch {
    return null
  }
}

export async function captureZaiSnapshotMode(
  modeConfig: (typeof ZAI_SNAPSHOT_MODES)[number],
  options: ZaiSnapshotOptions,
): Promise<ZaiSnapshotEntry> {
  const fetchImpl = options.fetch ?? fetch
  const startedAt = Date.now()
  const response = await fetchImpl(new URL(modeConfig.path, normalizeBaseUrl(options.baseUrl)), {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  })
  const measuredLatencyMs = Date.now() - startedAt
  const body = await readJsonBody(response)

  return {
    mode: modeConfig.mode,
    status: readNumber(body?.status) ?? response.status,
    latencyMs: readNumber(body?.latencyMs) ?? measuredLatencyMs,
    parsed: body?.parsed === true,
    requestId: readString(body?.requestId) ?? readString(response.headers.get('x-request-id')),
    zaiRequestId: readString(body?.zaiRequestId),
  }
}

export async function runZaiSnapshot(options: ZaiSnapshotOptions): Promise<ZaiSnapshotEntry[]> {
  const entries: ZaiSnapshotEntry[] = []

  for (const modeConfig of ZAI_SNAPSHOT_MODES) {
    entries.push(await captureZaiSnapshotMode(modeConfig, options))
  }

  return entries
}
