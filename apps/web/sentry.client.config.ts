import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',

  // Sample 20% of page-load transactions to keep costs manageable
  tracesSampleRate: 0.2,

  // Replay is disabled for MVP — enable later if needed
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
})
