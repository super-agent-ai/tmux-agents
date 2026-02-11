import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './src',
    exclude: ['test/integration/**'],
    alias: {
      'vscode': path.resolve(__dirname, 'src/__tests__/__mocks__/vscode.ts'),
    },
  },
});
