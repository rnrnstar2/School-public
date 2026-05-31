import { jsonResponse, cachedJsonResponse } from '@/lib/api/response'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type SmokeModuleRow = {
  track_id: string | null
}

const REQUIRED_TRACKS = [
  'web-builder-ai',
  'ai-automation',
  'ai-content-creator',
  'ai-app-builder',
] as const

export async function GET(request: Request) {
  const supabase = createServiceClient() ?? await createClient()

  const [atomsResult, atomVersionsResult, personasResult, modulesResult] = await Promise.all([
    supabase.from('lesson_atoms').select('*', { count: 'exact', head: true }),
    supabase.from('lesson_atom_versions').select('*', { count: 'exact', head: true }),
    supabase.from('personas').select('*', { count: 'exact', head: true }),
    supabase.from('modules').select('track_id'),
  ])

  const errors = [
    atomsResult.error,
    atomVersionsResult.error,
    personasResult.error,
    modulesResult.error,
  ].filter(Boolean)

  if (errors.length > 0) {
    return jsonResponse({
      status: 'degraded',
      error: 'smoke_query_failed',
      details: errors.map((error) => error?.message ?? 'unknown_error'),
    }, { status: 503 }, request)
  }

  const moduleRows = (modulesResult.data ?? []) as SmokeModuleRow[]
  const presentTracks = Array.from(
    new Set(
      moduleRows
        .map((module) => module.track_id)
        .filter((trackId): trackId is string => Boolean(trackId))
    )
  ).sort()

  const missingTracks = REQUIRED_TRACKS.filter((trackId) => !presentTracks.includes(trackId))

  const counts = {
    atoms: atomsResult.count ?? 0,
    atomVersions: atomVersionsResult.count ?? 0,
    personas: personasResult.count ?? 0,
    modules: moduleRows.length,
    tracks: presentTracks.length,
  }

  const checks = {
    atoms: counts.atoms > 0 ? 'ok' : 'fail',
    atomVersions: counts.atomVersions > 0 ? 'ok' : 'fail',
    personas: counts.personas > 0 ? 'ok' : 'fail',
    modules: counts.modules > 0 ? 'ok' : 'fail',
    tracks: missingTracks.length === 0 ? 'ok' : 'fail',
  } as const

  const ok = Object.values(checks).every((value) => value === 'ok')
  const payload = {
    status: ok ? 'healthy' : 'degraded',
    checks,
    counts,
    required_tracks: REQUIRED_TRACKS,
    present_tracks: presentTracks,
    missing_tracks: missingTracks,
    generated_at: new Date().toISOString(),
  }

  if (!ok) {
    return jsonResponse(payload, { status: 503 }, request)
  }

  return cachedJsonResponse(payload, { maxAge: 10, swr: 30 }, request)
}
