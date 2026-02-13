import { describe, it, expect } from 'vitest';
import { ProcessTracker } from '../core/processTracker';
import { ProcessCategory } from '../core/types';

describe('ProcessTracker', () => {
    const tracker = new ProcessTracker();

    // ─── categorizeProcess ───────────────────────────────────────────────

    describe('categorizeProcess', () => {
        it('categorizes make as BUILDING', () => {
            const result = tracker.categorizeProcess('make');
            expect(result.category).toBe(ProcessCategory.BUILDING);
            expect(result.description).toBe('make');
        });

        it('categorizes npm run build as BUILDING', () => {
            const result = tracker.categorizeProcess('npm run build');
            expect(result.category).toBe(ProcessCategory.BUILDING);
        });

        it('categorizes tsc as BUILDING', () => {
            const result = tracker.categorizeProcess('tsc');
            expect(result.category).toBe(ProcessCategory.BUILDING);
        });

        it('categorizes cargo build as BUILDING', () => {
            const result = tracker.categorizeProcess('cargo build');
            expect(result.category).toBe(ProcessCategory.BUILDING);
        });

        it('categorizes pytest as TESTING', () => {
            const result = tracker.categorizeProcess('pytest');
            expect(result.category).toBe(ProcessCategory.TESTING);
            expect(result.description).toBe('pytest');
        });

        it('categorizes jest as TESTING', () => {
            const result = tracker.categorizeProcess('jest');
            expect(result.category).toBe(ProcessCategory.TESTING);
        });

        it('categorizes vitest as TESTING', () => {
            const result = tracker.categorizeProcess('vitest');
            expect(result.category).toBe(ProcessCategory.TESTING);
        });

        it('categorizes npm install as INSTALLING', () => {
            const result = tracker.categorizeProcess('npm install');
            expect(result.category).toBe(ProcessCategory.INSTALLING);
        });

        it('categorizes pip install as INSTALLING', () => {
            const result = tracker.categorizeProcess('pip install requests');
            expect(result.category).toBe(ProcessCategory.INSTALLING);
        });

        it('categorizes node as RUNNING', () => {
            const result = tracker.categorizeProcess('node');
            expect(result.category).toBe(ProcessCategory.RUNNING);
        });

        it('categorizes python as RUNNING', () => {
            const result = tracker.categorizeProcess('python');
            expect(result.category).toBe(ProcessCategory.RUNNING);
        });

        it('categorizes bash as IDLE', () => {
            const result = tracker.categorizeProcess('bash');
            expect(result.category).toBe(ProcessCategory.IDLE);
            expect(result.description).toBe('shell');
        });

        it('categorizes zsh as IDLE', () => {
            const result = tracker.categorizeProcess('zsh');
            expect(result.category).toBe(ProcessCategory.IDLE);
        });

        it('categorizes -bash (login shell) as IDLE', () => {
            const result = tracker.categorizeProcess('-bash');
            expect(result.category).toBe(ProcessCategory.IDLE);
        });

        it('returns IDLE for empty command', () => {
            const result = tracker.categorizeProcess('');
            expect(result.category).toBe(ProcessCategory.IDLE);
            expect(result.description).toBe('idle');
        });

        it('returns RUNNING for unknown non-empty command', () => {
            const result = tracker.categorizeProcess('my-custom-tool');
            expect(result.category).toBe(ProcessCategory.RUNNING);
            expect(result.description).toBe('my-custom-tool');
        });
    });

    // ─── getProcessDescription ───────────────────────────────────────────

    describe('getProcessDescription', () => {
        it('returns label for known command', () => {
            expect(tracker.getProcessDescription('webpack')).toBe('webpack');
        });

        it('returns trimmed command for unknown command', () => {
            expect(tracker.getProcessDescription('  my-tool  ')).toBe('my-tool');
        });

        it('returns idle for empty command', () => {
            expect(tracker.getProcessDescription('')).toBe('idle');
        });
    });

    // ─── enrichPane ──────────────────────────────────────────────────────

    describe('enrichPane', () => {
        it('adds processCategory and processDescription to pane', () => {
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
            expect(enriched.processCategory).toBe(ProcessCategory.BUILDING);
            expect(enriched.processDescription).toBe('cargo build');
        });
    });
});
