import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus } from '../types';
import type { OrchestratorTask, KanbanSwimLane, TmuxSession } from '../types';
import { syncTaskListAttachments, SessionSyncContext } from '../sessionSync';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTask(id: string, overrides: Partial<OrchestratorTask> = {}): OrchestratorTask {
    return {
        id,
        description: `Task ${id}`,
        status: TaskStatus.IN_PROGRESS,
        priority: 5,
        createdAt: Date.now(),
        kanbanColumn: 'in_progress',
        ...overrides,
    };
}

function makeLane(overrides: Partial<KanbanSwimLane> = {}): KanbanSwimLane {
    return {
        id: 'lane-1',
        name: 'Test Lane',
        serverId: 'local',
        workingDirectory: '~/',
        sessionName: 'test-lane',
        createdAt: Date.now(),
        sessionActive: true,
        ...overrides,
    };
}

function makeSession(name: string, overrides: Partial<TmuxSession> = {}): TmuxSession {
    return {
        serverId: 'local',
        name,
        isAttached: true,
        created: String(Date.now()),
        lastActivity: String(Date.now()),
        windows: [],
        ...overrides,
    };
}

function makeWindow(sessionName: string, index: string, name: string) {
    return {
        serverId: 'local',
        sessionName,
        index,
        name,
        isActive: index === '0',
        panes: [{ serverId: 'local', sessionName, windowIndex: index, index: '0', command: 'bash', currentPath: '~/', isActive: true, pid: 123 }],
    };
}

function makeMockContext(
    tasks: OrchestratorTask[],
    swimLanes: KanbanSwimLane[],
    sessions: TmuxSession[]
): SessionSyncContext & {
    savedTasks: OrchestratorTask[];
    savedLanes: KanbanSwimLane[];
    refreshCalled: boolean;
    kanbanUpdated: boolean;
} {
    const savedTasks: OrchestratorTask[] = [];
    const savedLanes: KanbanSwimLane[] = [];
    let refreshCalled = false;
    let kanbanUpdated = false;

    return {
        savedTasks,
        savedLanes,
        refreshCalled,
        kanbanUpdated,
        serviceManager: {
            getService: (_serverId: string) => ({
                getTmuxTree: vi.fn().mockResolvedValue(sessions),
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
            saveSwimLane: vi.fn().mockImplementation((lane: KanbanSwimLane) => { savedLanes.push({ ...lane }); }),
        } as any,
        swimLanes,
        updateKanban: vi.fn().mockImplementation(() => { kanbanUpdated = true; }),
    };
}

// ─── syncTaskListAttachments ────────────────────────────────────────────────

describe('syncTaskListAttachments', () => {
    it('attaches unbound in_progress task when session is maximized (attached)', async () => {
        const taskId = 'task-1234567890123-abcdef';
        const winName = 'task-task-1234567890-xyz123-task';
        const task = makeTask(taskId, {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
        });
        const lane = makeLane();
        const session = makeSession('test-lane', {
            isAttached: true,
            windows: [makeWindow('test-lane', '1', winName)],
        });

        const ctx = makeMockContext([task], [lane], [session]);
        await syncTaskListAttachments(ctx);

        // Task should now be bound to the window
        expect(task.tmuxSessionName).toBe('test-lane');
        expect(task.tmuxWindowIndex).toBe('1');
        expect(task.tmuxPaneIndex).toBe('0');
        expect(task.tmuxServerId).toBe('local');
        expect(ctx.savedTasks).toHaveLength(1);
    });

    it('does not attach when session does not exist (no-op)', async () => {
        const task = makeTask('task-1234567890123-abcdef', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
        });
        const lane = makeLane({ sessionActive: true });

        // No matching session in tmux
        const ctx = makeMockContext([task], [lane], []);
        await syncTaskListAttachments(ctx);

        // Task should remain unbound
        expect(task.tmuxSessionName).toBeUndefined();
        expect(task.tmuxWindowIndex).toBeUndefined();
        expect(ctx.savedTasks).toHaveLength(0);

        // Lane sessionActive should be set to false
        expect(lane.sessionActive).toBe(false);
    });

    it('does not attach when session exists but is not maximized (not attached)', async () => {
        const taskId = 'task-1234567890123-abcdef';
        const winName = 'task-task-1234567890-xyz123-task';
        const task = makeTask(taskId, {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
        });
        const lane = makeLane();
        const session = makeSession('test-lane', {
            isAttached: false,
            windows: [makeWindow('test-lane', '1', winName)],
        });

        const ctx = makeMockContext([task], [lane], [session]);
        await syncTaskListAttachments(ctx);

        // Task should remain unbound (session not maximized)
        expect(task.tmuxSessionName).toBeUndefined();
        expect(task.tmuxWindowIndex).toBeUndefined();
    });

    it('is a no-op when task is already correctly attached', async () => {
        const taskId = 'task-1234567890123-abcdef';
        const winName = 'task-task-1234567890-xyz123-task';
        const task = makeTask(taskId, {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
            tmuxSessionName: 'test-lane',
            tmuxWindowIndex: '1',
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const lane = makeLane();
        const session = makeSession('test-lane', {
            isAttached: true,
            windows: [makeWindow('test-lane', '1', winName)],
        });

        const ctx = makeMockContext([task], [lane], [session]);
        await syncTaskListAttachments(ctx);

        // No saves should have occurred — task was already bound
        expect(ctx.savedTasks).toHaveLength(0);
    });

    it('rebinds task when window was killed and a new matching window exists', async () => {
        const taskId = 'task-1234567890123-abcdef';
        const winName = 'task-task-1234567890-xyz123-task';
        const task = makeTask(taskId, {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
            tmuxSessionName: 'test-lane',
            tmuxWindowIndex: '5',  // Old window index that no longer exists
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const lane = makeLane();
        const session = makeSession('test-lane', {
            isAttached: true,
            windows: [makeWindow('test-lane', '2', winName)],  // New window at index 2
        });

        const ctx = makeMockContext([task], [lane], [session]);
        await syncTaskListAttachments(ctx);

        // Task should be rebound to the new window index
        expect(task.tmuxSessionName).toBe('test-lane');
        expect(task.tmuxWindowIndex).toBe('2');
        expect(ctx.savedTasks).toHaveLength(1);
    });

    it('does not attach tasks in backlog or todo columns', async () => {
        const taskId = 'task-1234567890123-abcdef';
        const winName = 'task-task-1234567890-xyz123-task';
        const taskBacklog = makeTask(taskId, {
            swimLaneId: 'lane-1',
            kanbanColumn: 'backlog',
            status: TaskStatus.PENDING,
        });
        const taskTodo = makeTask('task-9876543210123-zyxwvu', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'todo',
            status: TaskStatus.PENDING,
        });
        const lane = makeLane();
        const session = makeSession('test-lane', {
            isAttached: true,
            windows: [makeWindow('test-lane', '1', winName)],
        });

        const ctx = makeMockContext([taskBacklog, taskTodo], [lane], [session]);
        await syncTaskListAttachments(ctx);

        expect(taskBacklog.tmuxSessionName).toBeUndefined();
        expect(taskTodo.tmuxSessionName).toBeUndefined();
        expect(ctx.savedTasks).toHaveLength(0);
    });

    it('attaches in_review tasks to matching windows', async () => {
        const taskId = 'task-1234567890123-abcdef';
        const winName = 'task-task-1234567890-xyz123-task';
        const task = makeTask(taskId, {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_review',
            status: TaskStatus.IN_PROGRESS,
        });
        const lane = makeLane();
        const session = makeSession('test-lane', {
            isAttached: true,
            windows: [makeWindow('test-lane', '3', winName)],
        });

        const ctx = makeMockContext([task], [lane], [session]);
        await syncTaskListAttachments(ctx);

        expect(task.tmuxSessionName).toBe('test-lane');
        expect(task.tmuxWindowIndex).toBe('3');
    });

    it('updates sessionActive to true when session exists but lane says inactive', async () => {
        const lane = makeLane({ sessionActive: false });
        const session = makeSession('test-lane', { isAttached: false });

        const ctx = makeMockContext([], [lane], [session]);
        await syncTaskListAttachments(ctx);

        expect(lane.sessionActive).toBe(true);
        expect(ctx.savedLanes).toHaveLength(1);
    });

    it('updates sessionActive to false when session is gone', async () => {
        const lane = makeLane({ sessionActive: true });

        const ctx = makeMockContext([], [lane], []);
        await syncTaskListAttachments(ctx);

        expect(lane.sessionActive).toBe(false);
        expect(ctx.savedLanes).toHaveLength(1);
    });

    it('handles multiple lanes independently', async () => {
        const taskA = makeTask('task-aaaa567890123-abcdef', {
            swimLaneId: 'lane-a',
            kanbanColumn: 'in_progress',
        });
        const taskB = makeTask('task-bbbb567890123-ghijkl', {
            swimLaneId: 'lane-b',
            kanbanColumn: 'in_progress',
        });
        const laneA = makeLane({ id: 'lane-a', sessionName: 'sess-a' });
        const laneB = makeLane({ id: 'lane-b', sessionName: 'sess-b' });

        const sessA = makeSession('sess-a', {
            isAttached: true,
            windows: [makeWindow('sess-a', '1', 'task-aaaa567890123-xyz-task')],
        });
        // Session B exists but is not attached
        const sessB = makeSession('sess-b', {
            isAttached: false,
            windows: [makeWindow('sess-b', '1', 'task-bbbb567890123-abc-task')],
        });

        const ctx = makeMockContext([taskA, taskB], [laneA, laneB], [sessA, sessB]);
        await syncTaskListAttachments(ctx);

        // Task A should be bound (session attached)
        expect(taskA.tmuxSessionName).toBe('sess-a');
        // Task B should not be bound (session not attached)
        expect(taskB.tmuxSessionName).toBeUndefined();
    });

    it('does not produce duplicate attachments on repeated calls', async () => {
        const taskId = 'task-1234567890123-abcdef';
        const winName = 'task-task-1234567890-xyz123-task';
        const task = makeTask(taskId, {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
        });
        const lane = makeLane();
        const session = makeSession('test-lane', {
            isAttached: true,
            windows: [makeWindow('test-lane', '1', winName)],
        });

        const ctx = makeMockContext([task], [lane], [session]);

        // First call — should bind
        await syncTaskListAttachments(ctx);
        expect(ctx.savedTasks).toHaveLength(1);

        // Clear saved tasks tracker
        ctx.savedTasks.length = 0;

        // Second call — task is already bound, should be a no-op
        await syncTaskListAttachments(ctx);
        expect(ctx.savedTasks).toHaveLength(0);
    });

    it('gracefully handles when service is unavailable', async () => {
        const task = makeTask('task-1234567890123-abcdef', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
        });
        const lane = makeLane({ serverId: 'missing-server' });

        const ctx = makeMockContext([task], [lane], []);
        // Override to return null for unknown servers
        ctx.serviceManager.getService = (_id: string) => null as any;

        // Should not throw
        await syncTaskListAttachments(ctx);
        expect(task.tmuxSessionName).toBeUndefined();
    });

    it('gracefully handles when getTmuxTree throws', async () => {
        const task = makeTask('task-1234567890123-abcdef', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
        });
        const lane = makeLane();

        const ctx = makeMockContext([task], [lane], []);
        ctx.serviceManager.getService = (_id: string) => ({
            getTmuxTree: vi.fn().mockRejectedValue(new Error('connection refused')),
        }) as any;

        // Should not throw
        await syncTaskListAttachments(ctx);
        expect(task.tmuxSessionName).toBeUndefined();
    });

    it('does not touch tasks from a different swim lane', async () => {
        const task = makeTask('task-1234567890123-abcdef', {
            swimLaneId: 'other-lane',
            kanbanColumn: 'in_progress',
        });
        const lane = makeLane({ id: 'lane-1', sessionName: 'test-lane' });
        const session = makeSession('test-lane', {
            isAttached: true,
            windows: [makeWindow('test-lane', '1', 'task-task-1234567890-xyz-task')],
        });

        const ctx = makeMockContext([task], [lane], [session]);
        await syncTaskListAttachments(ctx);

        // Task belongs to different lane, should be untouched
        expect(task.tmuxSessionName).toBeUndefined();
        expect(ctx.savedTasks).toHaveLength(0);
    });
});
