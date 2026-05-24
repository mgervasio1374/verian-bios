import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals:     true,
    environment: 'node',
    include:     ['tests/**/*.test.ts'],
    alias: {
      '@': resolve(__dirname, '.'),
      // server-only is a Next.js guard — safe to stub in test environment
      'server-only': resolve(__dirname, 'tests/__mocks__/server-only.ts'),
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      'server-only': resolve(__dirname, 'tests/__mocks__/server-only.ts'),
    },
  },
})
