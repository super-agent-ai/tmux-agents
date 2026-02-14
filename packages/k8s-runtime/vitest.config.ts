import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './src',
    include: [
      '__tests__/runtimes/**/*.test.ts'
    ],
    exclude: [
      'node_modules/**',
      '**/*.js',
      '__tests__/*.test.ts',
      '__tests__/cli/**',
      '__tests__/commands/**',
      '__tests__/core/**'
    ],
  },
});
