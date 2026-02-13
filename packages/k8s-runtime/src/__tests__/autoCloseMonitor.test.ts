import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus } from '../types';
import type { OrchestratorTask } from '../types';
import {
    summarisePaneOutput,
    checkAutoCloseTimers,
    cancelAutoClose,
    markDoneTimestamp,
    AutoCloseMonitorContext,
} from '../autoCloseMonitor';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTask(id: string, overrides: Partial<OrchestratorTask> = {}): OrchestratorTask {
    return {
        id,
        description: `Task ${id}`,
        status: TaskStatus.COMPLETED,
        priority: 5,
        createdAt: Date.now(),
        kanbanColumn: 'done',
        ...overrides,
    };
}

function makeMockContext(tasks: OrchestratorTask[]): AutoCloseMonitorContext & {
    capturedPaneContent: string;
    killWindowCalls: Array<{ session: string; window: string }>;
    savedTasks: OrchestratorTask[];
    refreshCalled: boolean;
    kanbanUpdated: boolean;
    dashboardUpdated: boolean;
} {
    const killWindowCalls: Array<{ session: string; window: string }> = [];
    const savedTasks: OrchestratorTask[] = [];
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
            getService: (_serverId: string) => ({
                capturePaneContent: vi.fn().mockResolvedValue(capturedPaneContent),
                killWindow: vi.fn().mockImplementation(async (session: string, window: string) => {
                    killWindowCalls.push({ session, window });
                }),
            }),
        } as any,
        tmuxSessionProvider: {
            refresh: vi.fn().mockImplementation(() => { refreshCalled = true; }),
        } as any,
        orchestrator: {
            getTaskQueue: () => tasks,
        } as any,
        database: {
            saveTask: vi.fn().mockImplementation((task: OrchestratorTask) => { savedTasks.push({ ...task }); }),
        } as any,
        updateKanban: vi.fn().mockImplementation(() => { kanbanUpdated = true; }),
        updateDashboard: vi.fn().mockImplementation(async () => { dashboardUpdated = true; }),
    };
}

// ─── summarisePaneOutput ────────────────────────────────────────────────────

describe('summarisePaneOutput', () => {
    it('returns placeholder for empty input', () => {
        expect(summarisePaneOutput('')).toBe('(no output captured)');
        expect(summarisePaneOutput('   ')).toBe('(no output captured)');
    });

    it('captures error lines as issues', () => {
        const output = 'Starting build\nError: Module not found\nBuild failed';
        const summary = summarisePaneOutput(output);
        expect(summary).toContain('Issues:');
        expect(summary).toContain('Error: Module not found');
    });

    it('captures result/success lines', () => {
        const output = 'Compiling...\nBuild successful\n5 tests passed';
        const summary = summarisePaneOutput(output);
        expect(summary).toContain('Build successful');
        expect(summary).toContain('5 tests passed');
    });

    it('falls back to tail when no patterns match', () => {
        const output = 'line one\nline two\nline three';
        const summary = summarisePaneOutput(output);
        expect(summary).toContain('line one');
    });
});

// ─── markDoneTimestamp ──────────────────────────────────────────────────────

describe('markDoneTimestamp', () => {
    it('sets doneAt when task has tmux window info', () => {
        const task = makeTask('t1', {
            tmuxSessionName: 'sess',
            tmuxWindowIndex: '1',
            tmuxServerId: 'local',
        });
        expect(task.doneAt).toBeUndefined();
        markDoneTimestamp(task);
        expect(task.doneAt).toBeTypeOf('number');
        expect(task.doneAt).toBeGreaterThan(0);
    });

    it('does not set doneAt when task has no tmux window', () => {
        const task = makeTask('t2');
        markDoneTimestamp(task);
        expect(task.doneAt).toBeUndefined();
    });
});

// ─── cancelAutoClose ────────────────────────────────────────────────────────

describe('cancelAutoClose', () => {
    it('clears the doneAt timestamp', () => {
        const task = makeTask('t1', { doneAt: Date.now() });
        cancelAutoClose(task);
        expect(task.doneAt).toBeUndefined();
    });
});

// ─── checkAutoCloseTimers ───────────────────────────────────────────────────

describe('checkAutoCloseTimers', () => {
    it('skips tasks not in done column', async () => {
        const task = makeTask('t1', {
            kanbanColumn: 'in_progress',
            doneAt: Date.now() - 20 * 60 * 1000,
            tmuxSessionName: 'sess',
            tmuxWindowIndex: '1',
            tmuxServerId: 'local',
        });
        const ctx = makeMockContext([task]);
        await checkAutoCloseTimers(ctx, 10 * 60 * 1000);
        expect(ctx.killWindowCalls).toHaveLength(0);
    });

    it('skips tasks without doneAt timestamp', async () => {
        const task = makeTask('t1', {
            tmuxSessionName: 'sess',
            tmuxWindowIndex: '1',
            tmuxServerId: 'local',
        });
        const ctx = makeMockContext([task]);
        await checkAutoCloseTimers(ctx, 10 * 60 * 1000);
        expect(ctx.killWindowCalls).toHaveLength(0);
    });

    it('skips tasks not yet past the delay threshold', async () => {
        const task = makeTask('t1', {
            doneAt: Date.now() - 5 * 60 * 1000, // 5 minutes ago
            tmuxSessionName: 'sess',
            tmuxWindowIndex: '1',
            tmuxServerId: 'local',
        });
        const ctx = makeMockContext([task]);
        await checkAutoCloseTimers(ctx, 10 * 60 * 1000);
        expect(ctx.killWindowCalls).toHaveLength(0);
    });

    it('skips tasks without tmux window info', async () => {
        const task = makeTask('t1', {
            doneAt: Date.now() - 20 * 60 * 1000,
        });
        const ctx = makeMockContext([task]);
        await checkAutoCloseTimers(ctx, 10 * 60 * 1000);
        expect(ctx.killWindowCalls).toHaveLength(0);
    });

    it('closes window and appends summary for eligible task', async () => {
        const task = makeTask('t1', {
            description: 'Original description',
            doneAt: Date.now() - 20 * 60 * 1000, // 20 minutes ago
            tmuxSessionName: 'my-session',
            tmuxWindowIndex: '2',
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const ctx = makeMockContext([task]);
        await checkAutoCloseTimers(ctx, 10 * 60 * 1000);

        // Window should be killed
        expect(ctx.killWindowCalls).toHaveLength(1);
        expect(ctx.killWindowCalls[0]).toEqual({ session: 'my-session', window: '2' });

        // Task title should remain unchanged
        expect(task.description).toBe('Original description');
        // Summary should be appended to input (description detail)
        expect(task.input).toContain('**Session Summary**');

        // Tmux references should be cleared
        expect(task.tmuxSessionName).toBeUndefined();
        expect(task.tmuxWindowIndex).toBeUndefined();
        expect(task.tmuxPaneIndex).toBeUndefined();
        expect(task.tmuxServerId).toBeUndefined();
    });

    it('handles task moved back from done before processing', async () => {
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
        ctx.serviceManager.getService = (id: string) => {
            // Change column before closeTaskWindow runs the re-check
            task.kanbanColumn = 'in_progress';
            return origGetService(id);
        };

        await checkAutoCloseTimers(ctx, 10 * 60 * 1000);
        // Window should NOT be killed because the task was moved back
        expect(ctx.killWindowCalls).toHaveLength(0);
    });

    it('processes multiple tasks independently', async () => {
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
        await checkAutoCloseTimers(ctx, 10 * 60 * 1000);

        // Only task1 and task2 should be closed
        expect(ctx.killWindowCalls).toHaveLength(2);
        expect(task1.tmuxSessionName).toBeUndefined();
        expect(task2.tmuxSessionName).toBeUndefined();
        // task3 should still have its tmux window
        expect(task3.tmuxSessionName).toBe('sess-c');
    });

    it('gracefully handles when killWindow throws (window already gone)', async () => {
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
        ctx.serviceManager.getService = (_id: string) => ({
            capturePaneContent: vi.fn().mockResolvedValue('some output'),
            killWindow: vi.fn().mockRejectedValue(new Error('window not found')),
        }) as any;

        // Should not throw
        await checkAutoCloseTimers(ctx, 10 * 60 * 1000);

        // Task references should still be cleaned up
        expect(task.tmuxSessionName).toBeUndefined();
        expect(task.input).toContain('**Session Summary**');
    });

    it('uses custom delay parameter', async () => {
        const task = makeTask('t1', {
            doneAt: Date.now() - 3 * 60 * 1000, // 3 minutes ago
            tmuxSessionName: 'sess',
            tmuxWindowIndex: '1',
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const ctx = makeMockContext([task]);

        // With 2-minute delay, the task should be closed
        await checkAutoCloseTimers(ctx, 2 * 60 * 1000);
        expect(ctx.killWindowCalls).toHaveLength(1);
    });
});
