"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promptRegistry_1 = require("../core/promptRegistry");
const promptExecutor_1 = require("../core/promptExecutor");
const types_1 = require("../core/types");
function makeContext(overrides = {}) {
    const registry = new promptRegistry_1.PromptRegistry();
    registry.load();
    return {
        promptRegistry: registry,
        submitTask: vitest_1.vi.fn(),
        saveTask: vitest_1.vi.fn(),
        startTaskFlow: vitest_1.vi.fn().mockResolvedValue(undefined),
        swimLanes: [],
        ...overrides,
    };
}
(0, vitest_1.describe)('PromptExecutor', () => {
    let executor;
    (0, vitest_1.beforeEach)(() => {
        executor = new promptExecutor_1.PromptExecutor();
    });
    // ─── Handler Registration ────────────────────────────────────────────────
    (0, vitest_1.describe)('handler registration', () => {
        (0, vitest_1.it)('registers default handlers', () => {
            (0, vitest_1.expect)(executor.hasHandler('create-test-plans')).toBe(true);
            (0, vitest_1.expect)(executor.hasHandler('auto-pass-tests')).toBe(true);
            (0, vitest_1.expect)(executor.hasHandler('install-plugins')).toBe(true);
        });
        (0, vitest_1.it)('returns all registered slugs', () => {
            const slugs = executor.getRegisteredSlugs();
            (0, vitest_1.expect)(slugs).toContain('create-test-plans');
            (0, vitest_1.expect)(slugs).toContain('auto-pass-tests');
            (0, vitest_1.expect)(slugs).toContain('install-plugins');
        });
        (0, vitest_1.it)('returns false for unregistered handler', () => {
            (0, vitest_1.expect)(executor.hasHandler('nonexistent')).toBe(false);
        });
        (0, vitest_1.it)('allows registering custom handlers', () => {
            executor.registerHandler({
                slug: 'custom-handler',
                execute: () => ({ success: true, taskId: 'test', resolvedPrompt: 'test' }),
            });
            (0, vitest_1.expect)(executor.hasHandler('custom-handler')).toBe(true);
        });
    });
    // ─── Execute ─────────────────────────────────────────────────────────────
    (0, vitest_1.describe)('execute', () => {
        (0, vitest_1.it)('fails for unknown slug', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'nonexistent',
                inputs: {},
            }, ctx);
            (0, vitest_1.expect)(result.success).toBe(false);
            (0, vitest_1.expect)(result.error).toContain('No handler registered');
        });
    });
    // ─── CreateTestPlanHandler ───────────────────────────────────────────────
    (0, vitest_1.describe)('CreateTestPlanHandler', () => {
        (0, vitest_1.it)('creates a task on valid input', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'create-test-plans',
                inputs: { requirements: 'User can log in with email and password' },
            }, ctx);
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.taskId).toBeTruthy();
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('User can log in with email and password');
            (0, vitest_1.expect)(ctx.submitTask).toHaveBeenCalledOnce();
            (0, vitest_1.expect)(ctx.saveTask).toHaveBeenCalledOnce();
            const task = ctx.submitTask.mock.calls[0][0];
            (0, vitest_1.expect)(task.description).toBe('Create Test Plans');
            (0, vitest_1.expect)(task.status).toBe(types_1.TaskStatus.PENDING);
            (0, vitest_1.expect)(task.tags).toContain('default-prompt');
            (0, vitest_1.expect)(task.tags).toContain('test-plans');
        });
        (0, vitest_1.it)('fails on missing requirements', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'create-test-plans',
                inputs: {},
            }, ctx);
            (0, vitest_1.expect)(result.success).toBe(false);
            (0, vitest_1.expect)(result.error).toContain('requirements');
            (0, vitest_1.expect)(ctx.submitTask).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('fails on empty requirements', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'create-test-plans',
                inputs: { requirements: '  ' },
            }, ctx);
            (0, vitest_1.expect)(result.success).toBe(false);
            (0, vitest_1.expect)(result.error).toContain('requirements');
        });
        (0, vitest_1.it)('uses default format when not provided', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'create-test-plans',
                inputs: { requirements: 'Test requirement' },
            }, ctx);
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('markdown');
        });
        (0, vitest_1.it)('sets swimLaneId when provided', () => {
            const ctx = makeContext();
            executor.execute({
                slug: 'create-test-plans',
                inputs: { requirements: 'Test requirement' },
                swimLaneId: 'lane-123',
            }, ctx);
            const task = ctx.submitTask.mock.calls[0][0];
            (0, vitest_1.expect)(task.swimLaneId).toBe('lane-123');
        });
        (0, vitest_1.it)('sets autoStart and todo column when autoStart is true', () => {
            const ctx = makeContext();
            executor.execute({
                slug: 'create-test-plans',
                inputs: { requirements: 'Test requirement' },
                autoStart: true,
            }, ctx);
            const task = ctx.submitTask.mock.calls[0][0];
            (0, vitest_1.expect)(task.autoStart).toBe(true);
            (0, vitest_1.expect)(task.kanbanColumn).toBe('todo');
        });
        (0, vitest_1.it)('sets backlog column when autoStart is not set', () => {
            const ctx = makeContext();
            executor.execute({
                slug: 'create-test-plans',
                inputs: { requirements: 'Test requirement' },
            }, ctx);
            const task = ctx.submitTask.mock.calls[0][0];
            (0, vitest_1.expect)(task.kanbanColumn).toBe('backlog');
        });
    });
    // ─── AutoPassTestsHandler ────────────────────────────────────────────────
    (0, vitest_1.describe)('AutoPassTestsHandler', () => {
        (0, vitest_1.it)('creates a task on valid input', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'auto-pass-tests',
                inputs: { testSuite: 'src/__tests__/*.test.ts' },
            }, ctx);
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.taskId).toBeTruthy();
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('src/__tests__/*.test.ts');
            (0, vitest_1.expect)(ctx.submitTask).toHaveBeenCalledOnce();
            const task = ctx.submitTask.mock.calls[0][0];
            (0, vitest_1.expect)(task.description).toBe('Auto-Pass All Tests');
            (0, vitest_1.expect)(task.priority).toBe(7);
            (0, vitest_1.expect)(task.tags).toContain('auto-pass-tests');
        });
        (0, vitest_1.it)('fails on missing testSuite', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'auto-pass-tests',
                inputs: {},
            }, ctx);
            (0, vitest_1.expect)(result.success).toBe(false);
            (0, vitest_1.expect)(result.error).toContain('testSuite');
            (0, vitest_1.expect)(ctx.submitTask).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('uses default testCommand when not provided', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'auto-pass-tests',
                inputs: { testSuite: 'tests/' },
            }, ctx);
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('npm test');
        });
        (0, vitest_1.it)('uses custom testCommand when provided', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'auto-pass-tests',
                inputs: { testSuite: 'tests/', testCommand: 'npx vitest run' },
            }, ctx);
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('npx vitest run');
        });
    });
    // ─── InstallPluginsHandler ───────────────────────────────────────────────
    (0, vitest_1.describe)('InstallPluginsHandler', () => {
        (0, vitest_1.it)('creates a task on valid input', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'install-plugins',
                inputs: { plugins: 'lodash, express' },
            }, ctx);
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.taskId).toBeTruthy();
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('lodash, express');
            (0, vitest_1.expect)(ctx.submitTask).toHaveBeenCalledOnce();
            const task = ctx.submitTask.mock.calls[0][0];
            (0, vitest_1.expect)(task.description).toBe('Install Plugins');
            (0, vitest_1.expect)(task.tags).toContain('install-plugins');
        });
        (0, vitest_1.it)('fails on missing plugins', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'install-plugins',
                inputs: {},
            }, ctx);
            (0, vitest_1.expect)(result.success).toBe(false);
            (0, vitest_1.expect)(result.error).toContain('plugins');
            (0, vitest_1.expect)(ctx.submitTask).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('uses default registry when not provided', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'install-plugins',
                inputs: { plugins: 'express' },
            }, ctx);
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('npm');
        });
        (0, vitest_1.it)('uses custom registry when provided', () => {
            const ctx = makeContext();
            const result = executor.execute({
                slug: 'install-plugins',
                inputs: { plugins: 'flask', registry: 'pip' },
            }, ctx);
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('pip');
        });
    });
    // ─── Integration: Handler Standalone ──────────────────────────────────────
    (0, vitest_1.describe)('standalone handler instances', () => {
        (0, vitest_1.it)('CreateTestPlanHandler has correct slug', () => {
            const handler = new promptExecutor_1.CreateTestPlanHandler();
            (0, vitest_1.expect)(handler.slug).toBe('create-test-plans');
        });
        (0, vitest_1.it)('AutoPassTestsHandler has correct slug', () => {
            const handler = new promptExecutor_1.AutoPassTestsHandler();
            (0, vitest_1.expect)(handler.slug).toBe('auto-pass-tests');
        });
        (0, vitest_1.it)('InstallPluginsHandler has correct slug', () => {
            const handler = new promptExecutor_1.InstallPluginsHandler();
            (0, vitest_1.expect)(handler.slug).toBe('install-plugins');
        });
    });
});
//# sourceMappingURL=promptExecutor.test.js.map