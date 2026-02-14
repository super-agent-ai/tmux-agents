"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const path_1 = __importDefault(require("path"));
exports.default = (0, config_1.defineConfig)({
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
            'vscode': path_1.default.resolve(__dirname, 'src/__tests__/__mocks__/vscode.ts'),
        },
    },
});
//# sourceMappingURL=vitest.config.js.map