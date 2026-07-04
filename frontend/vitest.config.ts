import { defineConfig } from 'vitest/config'

// The URL-state logic under test is pure (no DOM), so the default node
// environment is all we need — no jsdom, no setup files.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
