import { defineConfig } from 'vitest/config'

/**
 * Dedicated vitest config for the docs-drift rules.
 *
 * The root repo uses workspace-local vitest configs (apps/web,
 * lesson-factory, apps/admin). scripts/docs-drift lives outside those
 * workspaces, so we register our own node-environment config and drive
 * it via `pnpm docs:drift:test`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/docs-drift/__tests__/**/*.test.ts'],
    globals: true,
  },
})
