import { defineConfig } from 'vitest/config'

// Standalone test config (kept separate from vite.config.ts so the Tailwind /
// router build plugins don't run during unit tests).
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
