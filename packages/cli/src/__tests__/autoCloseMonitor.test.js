"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const types_1 = require("../core/types");
const autoCloseMonitor_1 = require("../autoCloseMonitor");
// ─── Helpers ────────────────────────────────────────────────────────────────
function makeTask(id, overrides = {}) {
    return {
        id,
        description: `Task ${id}`,
        status: types_1.TaskStatus.COMPLETED,
        priority: 5,
        createdAt: Date.now(),
        kanbanColumn: 'done',
        ...overrides,
    };
}
function makeMockContext(tasks) {
    const killWindowCalls = [];
    const savedTasks = [];
    let refreshCalled = false;
    let kanbanUpdated = false;
    let dashboardUpdated = false;
    const capturedPaneContent = '$ npm test\nRunning tests...\n5 passed, 0 failed\nDone.';
    return {
        capturedPaneContent,
        killWindowCalls,
        savedTasks,
        refreshCalled,
        kanbanUpdated,
        dashboardUpdated,
        serviceManager: {
            getService: (_serverId) => ({
                capturePaneContent: vitest_1.vi.fn().mockResolvedValue(capturedPaneContent),
                killWindow: vitest_1.vi.fn().mockImplementation(async (session, window) => {
                    killWindowCalls.push({ session, window });
                }),
            }),
        },
        tmuxSessionProvider: {
            refresh: vitest_1.vi.fn().mockImplementation(() => { refreshCalled = true; }),
        },
        orchestrator: {
            getTaskQueue: () => tasks,
        },
        database: {
            saveTask: vitest_1.vi.fn().mockImplementation((task) => { savedTasks.push({ ...task }); }),
        },
        updateKanban: vitest_1.vi.fn().mockImplementation(() => { kanbanUpdated = true; }),
        updateDashboard: vitest_1.vi.fn().mockImplementation(async () => { dashboardUpdated = true; }),
    };
}
// ─── summarisePaneOutput ────────────────────────────────────────────────────
(0, vitest_1.describe)('summarisePaneOutput', () => {
    (0, vitest_1.it)('returns placeholder for empty input', () => {
        (0, vitest_1.expect)((0, autoCloseMonitor_1.summarisePaneOutput)('')).toBe('(no output captured)');
        (0, vitest_1.expect)((0, autoCloseMonitor_1.summarisePaneOutput)('   ')).toBe('(no output captured)');
    });
    (0, vitest_1.it)('captures error lines as issues', () => {
        const output = 'Starting build\nError: Module not found\nBuild failed';
        const summary = (0, autoCloseMonitor_1.summarisePaneOutput)(output);
        (0, vitest_1.expect)(summary).toContain('Issues:');
        (0, vitest_1.expect)(summary).toContain('Error: Module not found');
    });
    (0, vitest_1.it)('captures result/success lines', () => {
        const output = 'Compiling...\nBuild successful\n5 tests passed';
        const summary = (0, autoCloseMonitor_1.summarisePaneOutput)(output);
        (0, vitest_1.expect)(summary).toContain('Build successful');
        (0, vitest_1.expect)(summary).toContain('5 tests passed');
    });
    (0, vitest_1.it)('falls back to tail when no patterns match', () => {
        const output = 'line one\nline two\nline three';
        const summary = (0, autoCloseMonitor_1.summarisePaneOutput)(output);
        (0, vitest_1.expect)(summary).toContain('line one');
    });
});
// ─── markDoneTimestamp ──────────────────────────────────────────────────────
(0, vitest_1.describe)('markDoneTimestamp', () => {
    (0, vitest_1.it)('sets doneAt when task has tmux window info', () => {
        const task = makeTask('t1', {
            tmuxSessionName: 'sess',
            tmuxWindowIndex: '1',
            tmuxServerId: 'local',
        });
        (0, vitest_1.expect)(task.doneAt).toBeUndefined();
        (0, autoCloseMonitor_1.markDoneTimestamp)(task);
        (0, vitest_1.expect)(task.doneAt).toBeTypeOf('number');
        (0, vitest_1.expect)(task.doneAt).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('does not set doneAt when task has no tmux window', () => {
        const task = makeTask('t2');
        (0, autoCloseMonitor_1.markDoneTimestamp)(task);
        (0, vitest_1.expect)(task.doneAt).toBeUndefined();
    });
});
// ─── cancelAutoClose ────────────────────────────────────────────────────────
(0, vitest_1.describe)('cancelAutoClose', () => {
    (0, vitest_1.it)('clears the doneAt timestamp', () => {
        const task = makeTask('t1', { doneAt: Date.now() });
        (0, autoCloseMonitor_1.cancelAutoClose)(task);
        (0, vitest_1.expect)(task.doneAt).toBeUndefined();
    });
});
// ─── checkAutoCloseTimers ───────────────────────────────────────────────────
(0, vitest_1.describe)('checkAutoCloseTimers', () => {
    (0, vitest_1.it)('skips tasks not in done column', async () => {
        const task = makeTask('t1', {
            kanbanColumn: 'in_progress',
            doneAt: Date.now() - 20 * 60 * 1000,
            tmuxSessionName: 'sess',
            tmuxWindowIndex: '1',
            tmuxServerId: 'local',
        });
        const ctx = makeMockContext([task]);
        await (0, autoCloseMonitor_1.checkAutoCloseTimers)(ctx, 10 * 60 * 1000);
        (0, vitest_1.expect)(ctx.killWindowCalls).toHaveLength(0);
    });
    (0, vitest_1.it)('skips tasks without doneAt timestamp', async () => {
        const task = makeTask('t1', {
            tmuxSessionName: 'sess',
            tmuxWindowIndex: '1',
            tmuxServerId: 'local',
        });
        const ctx = makeMockContext([task]);
        await (0, autoCloseMonitor_1.checkAutoCloseTimers)(ctx, 10 * 60 * 1000);
        (0, vitest_1.expect)(ctx.killWindowCalls).toHaveLength(0);
    });
    (0, vitest_1.it)('skips tasks not yet past the delay threshold', async () => {
        const task = makeTask('t1', {
            doneAt: Date.now() - 5 * 60 * 1000, // 5 minutes ago
            tmuxSessionName: 'sess',
            tmuxWindowIndex: '1',
            tmuxServerId: 'local',
        });
        const ctx = makeMockContext([task]);
        await (0, autoCloseMonitor_1.checkAutoCloseTimers)(ctx, 10 * 60 * 1000);
        (0, vitest_1.expect)(ctx.killWindowCalls).toHaveLength(0);
    });
    (0, vitest_1.it)('skips tasks without tmux window info', async () => {
        const task = makeTask('t1', {
            doneAt: Date.now() - 20 * 60 * 1000,
        });
        const ctx = makeMockContext([task]);
        await (0, autoCloseMonitor_1.checkAutoCloseTimers)(ctx, 10 * 60 * 1000);
        (0, vitest_1.expect)(ctx.killWindowCalls).toHaveLength(0);
    });
    (0, vitest_1.it)('closes window and appends summary for eligible task', async () => {
        const task = makeTask('t1', {
            description: 'Original description',
            doneAt: Date.now() - 20 * 60 * 1000, // 20 minutes ago
            tmuxSessionName: 'my-session',
            tmuxWindowIndex: '2',
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const ctx = makeMockContext([task]);
        await (0, autoCloseMonitor_1.checkAutoCloseTimers)(ctx, 10 * 60 * 1000);
        // Window should be killed
        (0, vitest_1.expect)(ctx.killWindowCalls).toHaveLength(1);
        (0, vitest_1.expect)(ctx.killWindowCalls[0]).toEqual({ session: 'my-session', window: '2' });
        // Task title should remain unchanged
        (0, vitest_1.expect)(task.description).toBe('Original description');
        // Summary should be appended to input (description detail)
        (0, vitest_1.expect)(task.input).toContain('**Session Summary**');
        // Tmux references should be cleared
        (0, vitest_1.expect)(task.tmuxSessionName).toBeUndefined();
        (0, vitest_1.expect)(task.tmuxWindowIndex).toBeUndefined();
        (0, vitest_1.expect)(task.tmuxPaneIndex).toBeUndefined();
        (0, vitest_1.expect)(task.tmuxServerId).toBeUndefined();
    });
    (0, vitest_1.it)('handles task moved back from done before processing', async () => {
        const task = makeTask('t1', {
            doneAt: Date.now() - 20 * 60 * 1000,
            tmuxSessionName: 'sess',
            tmuxWindowIndex: '1',
            tmuxServerId: 'local',
        });
        const ctx = makeMockContext([task]);
        // Simulate the task being moved back from done
        // between filter and processing
        const origGetService = ctx.serviceManager.getService;
        ctx.serviceManager.getService = (id) => {
            // Change column before closeTaskWindow runs the re-check
            task.kanbanColumn = 'in_progress';
            return origGetService(id);
        };
        await (0, autoCloseMonitor_1.checkAutoCloseTimers)(ctx, 10 * 60 * 1000);
        // Window should NOT be killed because the task was moved back
        (0, vitest_1.expect)(ctx.killWindowCalls).toHaveLength(0);
    });
    (0, vitest_1.it)('processes multiple tasks independently', async () => {
        const task1 = makeTask('t1', {
            description: 'Task one',
            doneAt: Date.now() - 20 * 60 * 1000,
            tmuxSessionName: 'sess-a',
            tmuxWindowIndex: '1',
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const task2 = makeTask('t2', {
            description: 'Task two',
            doneAt: Date.now() - 15 * 60 * 1000,
            tmuxSessionName: 'sess-b',
            tmuxWindowIndex: '3',
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const task3 = makeTask('t3', {
            description: 'Task three (not yet)',
            doneAt: Date.now() - 5 * 60 * 1000, // Only 5 minutes
            tmuxSessionName: 'sess-c',
            tmuxWindowIndex: '2',
            tmuxServerId: 'local',
        });
        const ctx = makeMockContext([task1, task2, task3]);
        await (0, autoCloseMonitor_1.checkAutoCloseTimers)(ctx, 10 * 60 * 1000);
        // Only task1 and task2 should be closed
        (0, vitest_1.expect)(ctx.killWindowCalls).toHaveLength(2);
        (0, vitest_1.expect)(task1.tmuxSessionName).toBeUndefined();
        (0, vitest_1.expect)(task2.tmuxSessionName).toBeUndefined();
        // task3 should still have its tmux window
        (0, vitest_1.expect)(task3.tmuxSessionName).toBe('sess-c');
    });
    (0, vitest_1.it)('gracefully handles when killWindow throws (window already gone)', async () => {
        const task = makeTask('t1', {
            description: 'My task',
            doneAt: Date.now() - 20 * 60 * 1000,
            tmuxSessionName: 'sess',
            tmuxWindowIndex: '1',
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const ctx = makeMockContext([task]);
        // Override killWindow to throw
        ctx.serviceManager.getService = (_id) => ({
            capturePaneContent: vitest_1.vi.fn().mockResolvedValue('some output'),
            killWindow: vitest_1.vi.fn().mockRejectedValue(new Error('window not found')),
        });
        // Should not throw
        await (0, autoCloseMonitor_1.checkAutoCloseTimers)(ctx, 10 * 60 * 1000);
        // Task references should still be cleaned up
        (0, vitest_1.expect)(task.tmuxSessionName).toBeUndefined();
        (0, vitest_1.expect)(task.input).toContain('**Session Summary**');
    });
    (0, vitest_1.it)('uses custom delay parameter', async () => {
        const task = makeTask('t1', {
            doneAt: Date.now() - 3 * 60 * 1000, // 3 minutes ago
            tmuxSessionName: 'sess',
            tmuxWindowIndex: '1',
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const ctx = makeMockContext([task]);
        // With 2-minute delay, the task should be closed
        await (0, autoCloseMonitor_1.checkAutoCloseTimers)(ctx, 2 * 60 * 1000);
        (0, vitest_1.expect)(ctx.killWindowCalls).toHaveLength(1);
    });
});
//# sourceMappingURL=autoCloseMonitor.test.js.map