import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PromptRegistry } from '../promptRegistry';
import {
    PromptExecutor,
    PromptExecutorContext,
    CreateTestPlanHandler,
    AutoPassTestsHandler,
    InstallPluginsHandler,
} from '../promptExecutor';
import { OrchestratorTask, TaskStatus } from '../types';

function makeContext(overrides: Partial<PromptExecutorContext> = {}): PromptExecutorContext {
    const registry = new PromptRegistry();
    registry.load();
    return {
        promptRegistry: registry,
        submitTask: vi.fn(),
        saveTask: vi.fn(),
        startTaskFlow: vi.fn().mockResolvedValue(undefined),
        swimLanes: [],
        ...overrides,
    };
}

describe('PromptExecutor', () => {
    let executor: PromptExecutor;

    beforeEach(() => {
        executor = new PromptExecutor();
    });

    // ─── Handler Registration ────────────────────────────────────────────────

    describe('handler registration', () => {
        it('registers default handlers', () => {
            expect(executor.hasHandler('create-test-plans')).toBe(true);
            expect(executor.hasHandler('auto-pass-tests')).toBe(true);
            expect(executor.hasHandler('install-plugins')).toBe(true);
        });

        it('returns all registered slugs', () => {
            const slugs = executor.getRegisteredSlugs();
            expect(slugs).toContain('create-test-plans');
            expect(slugs).toContain('auto-pass-tests');
            expect(slugs).toContain('install-plugins');
        });

        it('returns false for unregistered handler', () => {
            expect(executor.hasHandler('nonexistent')).toBe(false);
        });

        it('allows registering custom handlers', () => {
            executor.registerHandler({
                slug: 'custom-handler',
                execute: () => ({ success: true, taskId: 'test', resolvedPrompt: 'test' }),
            });
            expect(executor.hasHandler('custom-handler')).toBe(true);
        });
    });

    // ─── Execute ─────────────────────────────────────────────────────────────

    describe('execute', () => {
        it('fails for unknown slug', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'nonexistent',
                inputs: {},
            }, ctx);
            expect(result.success).toBe(false);
            expect(result.error).toContain('No handler registered');
        });
    });

    // ─── CreateTestPlanHandler ───────────────────────────────────────────────

    describe('CreateTestPlanHandler', () => {
        it('creates a task on valid input', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'create-test-plans',
                inputs: { requirements: 'User can log in with email and password' },
            }, ctx);

            expect(result.success).toBe(true);
            expect(result.taskId).toBeTruthy();
            expect(result.resolvedPrompt).toContain('User can log in with email and password');
            expect(ctx.submitTask).toHaveBeenCalledOnce();
            expect(ctx.saveTask).toHaveBeenCalledOnce();

            const task = (ctx.submitTask as ReturnType<typeof vi.fn>).mock.calls[0][0] as OrchestratorTask;
            expect(task.description).toBe('Create Test Plans');
            expect(task.status).toBe(TaskStatus.PENDING);
            expect(task.tags).toContain('default-prompt');
            expect(task.tags).toContain('test-plans');
        });

        it('fails on missing requirements', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'create-test-plans',
                inputs: {},
            }, ctx);

            expect(result.success).toBe(false);
            expect(result.error).toContain('requirements');
            expect(ctx.submitTask).not.toHaveBeenCalled();
        });

        it('fails on empty requirements', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'create-test-plans',
                inputs: { requirements: '  ' },
            }, ctx);

            expect(result.success).toBe(false);
            expect(result.error).toContain('requirements');
        });

        it('uses default format when not provided', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'create-test-plans',
                inputs: { requirements: 'Test requirement' },
            }, ctx);

            expect(result.success).toBe(true);
            expect(result.resolvedPrompt).toContain('markdown');
        });

        it('sets swimLaneId when provided', () => {
            const ctx = makeContext();
            executor.execute({
                slug: 'create-test-plans',
                inputs: { requirements: 'Test requirement' },
                swimLaneId: 'lane-123',
            }, ctx);

            const task = (ctx.submitTask as ReturnType<typeof vi.fn>).mock.calls[0][0] as OrchestratorTask;
            expect(task.swimLaneId).toBe('lane-123');
        });

        it('sets autoStart and todo column when autoStart is true', () => {
            const ctx = makeContext();
            executor.execute({
                slug: 'create-test-plans',
                inputs: { requirements: 'Test requirement' },
                autoStart: true,
            }, ctx);

            const task = (ctx.submitTask as ReturnType<typeof vi.fn>).mock.calls[0][0] as OrchestratorTask;
            expect(task.autoStart).toBe(true);
            expect(task.kanbanColumn).toBe('todo');
        });

        it('sets backlog column when autoStart is not set', () => {
            const ctx = makeContext();
            executor.execute({
                slug: 'create-test-plans',
                inputs: { requirements: 'Test requirement' },
            }, ctx);

            const task = (ctx.submitTask as ReturnType<typeof vi.fn>).mock.calls[0][0] as OrchestratorTask;
            expect(task.kanbanColumn).toBe('backlog');
        });
    });

    // ─── AutoPassTestsHandler ────────────────────────────────────────────────

    describe('AutoPassTestsHandler', () => {
        it('creates a task on valid input', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'auto-pass-tests',
                inputs: { testSuite: 'src/__tests__/*.test.ts' },
            }, ctx);

            expect(result.success).toBe(true);
            expect(result.taskId).toBeTruthy();
            expect(result.resolvedPrompt).toContain('src/__tests__/*.test.ts');
            expect(ctx.submitTask).toHaveBeenCalledOnce();

            const task = (ctx.submitTask as ReturnType<typeof vi.fn>).mock.calls[0][0] as OrchestratorTask;
            expect(task.description).toBe('Auto-Pass All Tests');
            expect(task.priority).toBe(7);
            expect(task.tags).toContain('auto-pass-tests');
        });

        it('fails on missing testSuite', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'auto-pass-tests',
                inputs: {},
            }, ctx);

            expect(result.success).toBe(false);
            expect(result.error).toContain('testSuite');
            expect(ctx.submitTask).not.toHaveBeenCalled();
        });

        it('uses default testCommand when not provided', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'auto-pass-tests',
                inputs: { testSuite: 'tests/' },
            }, ctx);

            expect(result.success).toBe(true);
            expect(result.resolvedPrompt).toContain('npm test');
        });

        it('uses custom testCommand when provided', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'auto-pass-tests',
                inputs: { testSuite: 'tests/', testCommand: 'npx vitest run' },
            }, ctx);

            expect(result.success).toBe(true);
            expect(result.resolvedPrompt).toContain('npx vitest run');
        });
    });

    // ─── InstallPluginsHandler ───────────────────────────────────────────────

    describe('InstallPluginsHandler', () => {
        it('creates a task on valid input', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'install-plugins',
                inputs: { plugins: 'lodash, express' },
            }, ctx);

            expect(result.success).toBe(true);
            expect(result.taskId).toBeTruthy();
            expect(result.resolvedPrompt).toContain('lodash, express');
            expect(ctx.submitTask).toHaveBeenCalledOnce();

            const task = (ctx.submitTask as ReturnType<typeof vi.fn>).mock.calls[0][0] as OrchestratorTask;
            expect(task.description).toBe('Install Plugins');
            expect(task.tags).toContain('install-plugins');
        });

        it('fails on missing plugins', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'install-plugins',
                inputs: {},
            }, ctx);

            expect(result.success).toBe(false);
            expect(result.error).toContain('plugins');
            expect(ctx.submitTask).not.toHaveBeenCalled();
        });

        it('uses default registry when not provided', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'install-plugins',
                inputs: { plugins: 'express' },
            }, ctx);

            expect(result.success).toBe(true);
            expect(result.resolvedPrompt).toContain('npm');
        });

        it('uses custom registry when provided', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'install-plugins',
                inputs: { plugins: 'flask', registry: 'pip' },
            }, ctx);

            expect(result.success).toBe(true);
            expect(result.resolvedPrompt).toContain('pip');
        });
    });

    // ─── Integration: Handler Standalone ──────────────────────────────────────

    describe('standalone handler instances', () => {
        it('CreateTestPlanHandler has correct slug', () => {
            const handler = new CreateTestPlanHandler();
            expect(handler.slug).toBe('create-test-plans');
        });

        it('AutoPassTestsHandler has correct slug', () => {
            const handler = new AutoPassTestsHandler();
            expect(handler.slug).toBe('auto-pass-tests');
        });

        it('InstallPluginsHandler has correct slug', () => {
            const handler = new InstallPluginsHandler();
            expect(handler.slug).toBe('install-plugins');
        });
    });
});
