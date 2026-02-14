import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './src',
    include: [
      'tui/**/*.test.ts',
      'tui/**/*.test.tsx',
      'client/**/*.test.ts'
    ],
    exclude: ['test/integration/**', 'node_modules/**', '**/*.js', '../dist/**', 'dist/**'],
    alias: {
      'vscode': path.resolve(__dirname, 'src/__tests__/__mocks__/vscode.ts'),
    },
  },
});
