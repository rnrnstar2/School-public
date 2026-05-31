// Fixture mirroring the relevant bit of apps/web/playwright.config.ts.
// We keep it stringy-parseable rather than importing the real config to
// avoid dragging @playwright/test into the vitest run.
export const playwright3200 = `const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT ?? '3200'`
export const playwright3000 = `const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT ?? '3000'`
export const playwrightMissing = `const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT ?? 'nope'`
