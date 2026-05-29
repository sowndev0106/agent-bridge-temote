import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts (which sets root: src/web for the SPA build).
// Tests live at the repo root under tests/ and import from src/.
export default defineConfig({
  root: '.',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
})
