import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './src',
    include: [
      '__tests__/**/*.test.ts'
    ],
    exclude: [
      'node_modules/**',
      '**/*.js',
      'dist/**'
    ],
  },
});
