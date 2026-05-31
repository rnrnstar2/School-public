import { createServerClient } from '@supabase/ssr'
import * as Sentry from '@sentry/nextjs'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Generate a unique request ID for tracing across logs and Sentry
  const requestId = crypto.randomUUID()

  // Attach request ID to incoming headers so API routes can read it
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  })

  // Attach X-Request-Id to outgoing response
  supabaseResponse.headers.set('X-Request-Id', requestId)

  // Set Sentry scope tags for correlation
  Sentry.setTag('request_id', requestId)
  Sentry.setTag('path', request.nextUrl.pathname)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          })
          // Re-apply X-Request-Id after supabaseResponse is recreated
          supabaseResponse.headers.set('X-Request-Id', requestId)
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — must call getUser() to trigger token refresh
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
