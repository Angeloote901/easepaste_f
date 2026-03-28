import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit tests: src/**/*.test.ts  (excludes integration tests)
    include: ['src/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      'src/**/*.integration.test.ts',
    ],
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.integration.test.ts',
        'src/api/index.ts',
        'src/worker/index.ts',
      ],
    },
  },
})
