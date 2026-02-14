import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './src',
    include: [
      '__tests__/cli/**/*.test.ts',
      'cli/**/*.test.ts',
      'client/**/*.test.ts',
      'core/__tests__/**/*.test.ts'
    ],
    exclude: ['test/integration/**', 'node_modules/**', '**/*.js'],
    alias: {
      'vscode': path.resolve(__dirname, 'src/__tests__/__mocks__/vscode.ts'),
    },
  },
});
