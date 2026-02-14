"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const processTracker_1 = require("../core/processTracker");
const types_1 = require("../core/types");
(0, vitest_1.describe)('ProcessTracker', () => {
    const tracker = new processTracker_1.ProcessTracker();
    // ─── categorizeProcess ───────────────────────────────────────────────
    (0, vitest_1.describe)('categorizeProcess', () => {
        (0, vitest_1.it)('categorizes make as BUILDING', () => {
            const result = tracker.categorizeProcess('make');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.BUILDING);
            (0, vitest_1.expect)(result.description).toBe('make');
        });
        (0, vitest_1.it)('categorizes npm run build as BUILDING', () => {
            const result = tracker.categorizeProcess('npm run build');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.BUILDING);
        });
        (0, vitest_1.it)('categorizes tsc as BUILDING', () => {
            const result = tracker.categorizeProcess('tsc');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.BUILDING);
        });
        (0, vitest_1.it)('categorizes cargo build as BUILDING', () => {
            const result = tracker.categorizeProcess('cargo build');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.BUILDING);
        });
        (0, vitest_1.it)('categorizes pytest as TESTING', () => {
            const result = tracker.categorizeProcess('pytest');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.TESTING);
            (0, vitest_1.expect)(result.description).toBe('pytest');
        });
        (0, vitest_1.it)('categorizes jest as TESTING', () => {
            const result = tracker.categorizeProcess('jest');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.TESTING);
        });
        (0, vitest_1.it)('categorizes vitest as TESTING', () => {
            const result = tracker.categorizeProcess('vitest');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.TESTING);
        });
        (0, vitest_1.it)('categorizes npm install as INSTALLING', () => {
            const result = tracker.categorizeProcess('npm install');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.INSTALLING);
        });
        (0, vitest_1.it)('categorizes pip install as INSTALLING', () => {
            const result = tracker.categorizeProcess('pip install requests');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.INSTALLING);
        });
        (0, vitest_1.it)('categorizes node as RUNNING', () => {
            const result = tracker.categorizeProcess('node');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.RUNNING);
        });
        (0, vitest_1.it)('categorizes python as RUNNING', () => {
            const result = tracker.categorizeProcess('python');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.RUNNING);
        });
        (0, vitest_1.it)('categorizes bash as IDLE', () => {
            const result = tracker.categorizeProcess('bash');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.IDLE);
            (0, vitest_1.expect)(result.description).toBe('shell');
        });
        (0, vitest_1.it)('categorizes zsh as IDLE', () => {
            const result = tracker.categorizeProcess('zsh');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.IDLE);
        });
        (0, vitest_1.it)('categorizes -bash (login shell) as IDLE', () => {
            const result = tracker.categorizeProcess('-bash');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.IDLE);
        });
        (0, vitest_1.it)('returns IDLE for empty command', () => {
            const result = tracker.categorizeProcess('');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.IDLE);
            (0, vitest_1.expect)(result.description).toBe('idle');
        });
        (0, vitest_1.it)('returns RUNNING for unknown non-empty command', () => {
            const result = tracker.categorizeProcess('my-custom-tool');
            (0, vitest_1.expect)(result.category).toBe(types_1.ProcessCategory.RUNNING);
            (0, vitest_1.expect)(result.description).toBe('my-custom-tool');
        });
    });
    // ─── getProcessDescription ───────────────────────────────────────────
    (0, vitest_1.describe)('getProcessDescription', () => {
        (0, vitest_1.it)('returns label for known command', () => {
            (0, vitest_1.expect)(tracker.getProcessDescription('webpack')).toBe('webpack');
        });
        (0, vitest_1.it)('returns trimmed command for unknown command', () => {
            (0, vitest_1.expect)(tracker.getProcessDescription('  my-tool  ')).toBe('my-tool');
        });
        (0, vitest_1.it)('returns idle for empty command', () => {
            (0, vitest_1.expect)(tracker.getProcessDescription('')).toBe('idle');
        });
    });
    // ─── enrichPane ──────────────────────────────────────────────────────
    (0, vitest_1.describe)('enrichPane', () => {
        (0, vitest_1.it)('adds processCategory and processDescription to pane', () => {
            const pane = {
                serverId: 'local',
                sessionName: 'test',
                windowIndex: '0',
                index: '0',
                command: 'cargo build',
                currentPath: '/project',
                isActive: true,
                pid: 123,
            };
            const enriched = tracker.enrichPane(pane);
            (0, vitest_1.expect)(enriched.processCategory).toBe(types_1.ProcessCategory.BUILDING);
            (0, vitest_1.expect)(enriched.processDescription).toBe('cargo build');
        });
    });
});
//# sourceMappingURL=processTracker.test.js.map