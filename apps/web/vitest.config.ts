import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.tsx'],
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    exclude: [
      'node_modules',
      '.next',
      // Exclude node:test-style lib tests (run via `node --test` in
      // `pnpm test`). `__tests__/` subdirectories are intentionally NOT
      // excluded here so vitest can pick them up — the shell glob used
      // by `pnpm test` (`src/lib/**/*.test.ts`) only expands one level
      // deep under bash's default globbing, so those files never reach
      // node:test anyway.
      'src/lib/ai/*.test.ts',
      'src/lib/atoms/*.test.ts',
      'src/lib/constants/*.test.ts',
      'src/lib/feedback/*.test.ts',
      'src/lib/lessons/*.test.ts',
      'src/lib/mentor-memory-compaction.test.ts',
      'src/lib/mentor/*.test.ts',
      'src/lib/mentor/core/*.test.ts',
      'src/lib/operations/*.test.ts',
      'src/lib/planner/*.test.ts',
      'src/lib/lesson-completion.test.ts',
      'src/lib/supabase/query-fallback.test.ts',
      // Exclude node:test-style API route tests (use node:test, not vitest)
      'src/app/api/**/route.test.ts',
    ],
    globals: true,
  },
})
