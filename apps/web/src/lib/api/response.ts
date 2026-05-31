import { NextResponse } from 'next/server'

/**
 * Helper to read X-Request-Id from request headers (set by middleware).
 */
export function getRequestId(request: Request): string | null {
  return request.headers.get('x-request-id')
}

/**
 * Build a JSON response with X-Request-Id attached.
 */
export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
  request?: Request,
): NextResponse {
  const requestId = request ? getRequestId(request) : null
  const headers: Record<string, string> = { ...init.headers }
  if (requestId) headers['X-Request-Id'] = requestId
  return NextResponse.json(body, { status: init.status, headers })
}

/**
 * Build a cached JSON response with stale-while-revalidate strategy.
 * maxAge: seconds to consider fresh (default 60)
 * swr: seconds to serve stale while revalidating (default 300)
 */
export function cachedJsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string>; maxAge?: number; swr?: number } = {},
  request?: Request,
): NextResponse {
  const maxAge = init.maxAge ?? 60
  const swr = init.swr ?? 300
  const requestId = request ? getRequestId(request) : null
  const headers: Record<string, string> = {
    ...init.headers,
    'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${swr}`,
  }
  if (requestId) headers['X-Request-Id'] = requestId
  return NextResponse.json(body, { status: init.status, headers })
}

/**
 * Build an SSE response with X-Request-Id and standard streaming headers.
 */
export function sseResponse(
  stream: ReadableStream<Uint8Array>,
  request?: Request,
): Response {
  const requestId = request ? getRequestId(request) : null
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream; charset=utf-8',
  }
  if (requestId) headers['X-Request-Id'] = requestId
  return new Response(stream, { headers })
}
