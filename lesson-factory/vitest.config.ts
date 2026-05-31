import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    // Temp worktree setup copies a trimmed lesson-factory fixture; on seeded
    // worktrees and immediately after full builds this can exceed the default.
    testTimeout: 60000,
  },
})
