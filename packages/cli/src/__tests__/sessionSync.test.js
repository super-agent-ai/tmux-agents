"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const types_1 = require("../core/types");
const sessionSync_1 = require("../sessionSync");
// ─── Helpers ────────────────────────────────────────────────────────────────
function makeTask(id, overrides = {}) {
    return {
        id,
        description: `Task ${id}`,
        status: types_1.TaskStatus.IN_PROGRESS,
        priority: 5,
        createdAt: Date.now(),
        kanbanColumn: 'in_progress',
        ...overrides,
    };
}
function makeLane(overrides = {}) {
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
function makeSession(name, overrides = {}) {
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
function makeWindow(sessionName, index, name) {
    return {
        serverId: 'local',
        sessionName,
        index,
        name,
        isActive: index === '0',
        panes: [{ serverId: 'local', sessionName, windowIndex: index, index: '0', command: 'bash', currentPath: '~/', isActive: true, pid: 123 }],
    };
}
function makeMockContext(tasks, swimLanes, sessions) {
    const savedTasks = [];
    const savedLanes = [];
    let refreshCalled = false;
    let kanbanUpdated = false;
    return {
        savedTasks,
        savedLanes,
        refreshCalled,
        kanbanUpdated,
        serviceManager: {
            getService: (_serverId) => ({
                getTmuxTree: vitest_1.vi.fn().mockResolvedValue(sessions),
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
            saveSwimLane: vitest_1.vi.fn().mockImplementation((lane) => { savedLanes.push({ ...lane }); }),
        },
        swimLanes,
        updateKanban: vitest_1.vi.fn().mockImplementation(() => { kanbanUpdated = true; }),
    };
}
// ─── syncTaskListAttachments ────────────────────────────────────────────────
(0, vitest_1.describe)('syncTaskListAttachments', () => {
    (0, vitest_1.it)('attaches unbound in_progress task when session is maximized (attached)', async () => {
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
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        // Task should now be bound to the window
        (0, vitest_1.expect)(task.tmuxSessionName).toBe('test-lane');
        (0, vitest_1.expect)(task.tmuxWindowIndex).toBe('1');
        (0, vitest_1.expect)(task.tmuxPaneIndex).toBe('0');
        (0, vitest_1.expect)(task.tmuxServerId).toBe('local');
        (0, vitest_1.expect)(ctx.savedTasks).toHaveLength(1);
    });
    (0, vitest_1.it)('does not attach when session does not exist (no-op)', async () => {
        const task = makeTask('task-1234567890123-abcdef', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
        });
        const lane = makeLane({ sessionActive: true });
        // No matching session in tmux
        const ctx = makeMockContext([task], [lane], []);
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        // Task should remain unbound
        (0, vitest_1.expect)(task.tmuxSessionName).toBeUndefined();
        (0, vitest_1.expect)(task.tmuxWindowIndex).toBeUndefined();
        (0, vitest_1.expect)(ctx.savedTasks).toHaveLength(0);
        // Lane sessionActive should be set to false
        (0, vitest_1.expect)(lane.sessionActive).toBe(false);
    });
    (0, vitest_1.it)('does not attach when session exists but is not maximized (not attached)', async () => {
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
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        // Task should remain unbound (session not maximized)
        (0, vitest_1.expect)(task.tmuxSessionName).toBeUndefined();
        (0, vitest_1.expect)(task.tmuxWindowIndex).toBeUndefined();
    });
    (0, vitest_1.it)('is a no-op when task is already correctly attached', async () => {
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
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        // No saves should have occurred — task was already bound
        (0, vitest_1.expect)(ctx.savedTasks).toHaveLength(0);
    });
    (0, vitest_1.it)('rebinds task when window was killed and a new matching window exists', async () => {
        const taskId = 'task-1234567890123-abcdef';
        const winName = 'task-task-1234567890-xyz123-task';
        const task = makeTask(taskId, {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
            tmuxSessionName: 'test-lane',
            tmuxWindowIndex: '5', // Old window index that no longer exists
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const lane = makeLane();
        const session = makeSession('test-lane', {
            isAttached: true,
            windows: [makeWindow('test-lane', '2', winName)], // New window at index 2
        });
        const ctx = makeMockContext([task], [lane], [session]);
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        // Task should be rebound to the new window index
        (0, vitest_1.expect)(task.tmuxSessionName).toBe('test-lane');
        (0, vitest_1.expect)(task.tmuxWindowIndex).toBe('2');
        (0, vitest_1.expect)(ctx.savedTasks).toHaveLength(1);
    });
    (0, vitest_1.it)('does not attach tasks in backlog or todo columns', async () => {
        const taskId = 'task-1234567890123-abcdef';
        const winName = 'task-task-1234567890-xyz123-task';
        const taskBacklog = makeTask(taskId, {
            swimLaneId: 'lane-1',
            kanbanColumn: 'backlog',
            status: types_1.TaskStatus.PENDING,
        });
        const taskTodo = makeTask('task-9876543210123-zyxwvu', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'todo',
            status: types_1.TaskStatus.PENDING,
        });
        const lane = makeLane();
        const session = makeSession('test-lane', {
            isAttached: true,
            windows: [makeWindow('test-lane', '1', winName)],
        });
        const ctx = makeMockContext([taskBacklog, taskTodo], [lane], [session]);
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        (0, vitest_1.expect)(taskBacklog.tmuxSessionName).toBeUndefined();
        (0, vitest_1.expect)(taskTodo.tmuxSessionName).toBeUndefined();
        (0, vitest_1.expect)(ctx.savedTasks).toHaveLength(0);
    });
    (0, vitest_1.it)('attaches in_review tasks to matching windows', async () => {
        const taskId = 'task-1234567890123-abcdef';
        const winName = 'task-task-1234567890-xyz123-task';
        const task = makeTask(taskId, {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_review',
            status: types_1.TaskStatus.IN_PROGRESS,
        });
        const lane = makeLane();
        const session = makeSession('test-lane', {
            isAttached: true,
            windows: [makeWindow('test-lane', '3', winName)],
        });
        const ctx = makeMockContext([task], [lane], [session]);
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        (0, vitest_1.expect)(task.tmuxSessionName).toBe('test-lane');
        (0, vitest_1.expect)(task.tmuxWindowIndex).toBe('3');
    });
    (0, vitest_1.it)('updates sessionActive to true when session exists but lane says inactive', async () => {
        const lane = makeLane({ sessionActive: false });
        const session = makeSession('test-lane', { isAttached: false });
        const ctx = makeMockContext([], [lane], [session]);
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        (0, vitest_1.expect)(lane.sessionActive).toBe(true);
        (0, vitest_1.expect)(ctx.savedLanes).toHaveLength(1);
    });
    (0, vitest_1.it)('updates sessionActive to false when session is gone', async () => {
        const lane = makeLane({ sessionActive: true });
        const ctx = makeMockContext([], [lane], []);
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        (0, vitest_1.expect)(lane.sessionActive).toBe(false);
        (0, vitest_1.expect)(ctx.savedLanes).toHaveLength(1);
    });
    (0, vitest_1.it)('handles multiple lanes independently', async () => {
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
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        // Task A should be bound (session attached)
        (0, vitest_1.expect)(taskA.tmuxSessionName).toBe('sess-a');
        // Task B should not be bound (session not attached)
        (0, vitest_1.expect)(taskB.tmuxSessionName).toBeUndefined();
    });
    (0, vitest_1.it)('does not produce duplicate attachments on repeated calls', async () => {
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
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        (0, vitest_1.expect)(ctx.savedTasks).toHaveLength(1);
        // Clear saved tasks tracker
        ctx.savedTasks.length = 0;
        // Second call — task is already bound, should be a no-op
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        (0, vitest_1.expect)(ctx.savedTasks).toHaveLength(0);
    });
    (0, vitest_1.it)('gracefully handles when service is unavailable', async () => {
        const task = makeTask('task-1234567890123-abcdef', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
        });
        const lane = makeLane({ serverId: 'missing-server' });
        const ctx = makeMockContext([task], [lane], []);
        // Override to return null for unknown servers
        ctx.serviceManager.getService = (_id) => null;
        // Should not throw
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        (0, vitest_1.expect)(task.tmuxSessionName).toBeUndefined();
    });
    (0, vitest_1.it)('gracefully handles when getTmuxTree throws', async () => {
        const task = makeTask('task-1234567890123-abcdef', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
        });
        const lane = makeLane();
        const ctx = makeMockContext([task], [lane], []);
        ctx.serviceManager.getService = (_id) => ({
            getTmuxTree: vitest_1.vi.fn().mockRejectedValue(new Error('connection refused')),
        });
        // Should not throw
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        (0, vitest_1.expect)(task.tmuxSessionName).toBeUndefined();
    });
    (0, vitest_1.it)('does not touch tasks from a different swim lane', async () => {
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
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        // Task belongs to different lane, should be untouched
        (0, vitest_1.expect)(task.tmuxSessionName).toBeUndefined();
        (0, vitest_1.expect)(ctx.savedTasks).toHaveLength(0);
    });
    // ─── Dead Session Detection (Orphaned Tasks) ────────────────────────────
    (0, vitest_1.it)('marks orphaned in_progress tasks as FAILED when session dies', async () => {
        const task = makeTask('task-1234567890123-abcdef', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
            status: types_1.TaskStatus.IN_PROGRESS,
            tmuxSessionName: 'test-lane',
            tmuxWindowIndex: '1',
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const lane = makeLane({ sessionActive: true });
        // No sessions exist — session has died
        const ctx = makeMockContext([task], [lane], []);
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        // Task should be marked as FAILED with cleared tmux references
        (0, vitest_1.expect)(task.status).toBe(types_1.TaskStatus.FAILED);
        (0, vitest_1.expect)(task.errorMessage).toBe('Tmux session no longer exists');
        (0, vitest_1.expect)(task.tmuxSessionName).toBeUndefined();
        (0, vitest_1.expect)(task.tmuxWindowIndex).toBeUndefined();
        (0, vitest_1.expect)(task.tmuxPaneIndex).toBeUndefined();
        (0, vitest_1.expect)(task.tmuxServerId).toBeUndefined();
        (0, vitest_1.expect)(ctx.savedTasks).toHaveLength(1);
    });
    (0, vitest_1.it)('marks orphaned in_review tasks as FAILED when session dies', async () => {
        const task = makeTask('task-1234567890123-abcdef', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_review',
            status: types_1.TaskStatus.IN_PROGRESS,
            tmuxSessionName: 'test-lane',
            tmuxWindowIndex: '2',
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const lane = makeLane({ sessionActive: true });
        const ctx = makeMockContext([task], [lane], []);
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        (0, vitest_1.expect)(task.status).toBe(types_1.TaskStatus.FAILED);
        (0, vitest_1.expect)(task.errorMessage).toBe('Tmux session no longer exists');
        (0, vitest_1.expect)(task.tmuxSessionName).toBeUndefined();
        (0, vitest_1.expect)(ctx.savedTasks).toHaveLength(1);
    });
    (0, vitest_1.it)('marks multiple orphaned tasks as FAILED when session dies', async () => {
        const task1 = makeTask('task-aaaa567890123-abcdef', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
            status: types_1.TaskStatus.IN_PROGRESS,
            tmuxSessionName: 'test-lane',
            tmuxWindowIndex: '1',
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const task2 = makeTask('task-bbbb567890123-ghijkl', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_review',
            status: types_1.TaskStatus.IN_PROGRESS,
            tmuxSessionName: 'test-lane',
            tmuxWindowIndex: '2',
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const lane = makeLane({ sessionActive: true });
        const ctx = makeMockContext([task1, task2], [lane], []);
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        (0, vitest_1.expect)(task1.status).toBe(types_1.TaskStatus.FAILED);
        (0, vitest_1.expect)(task2.status).toBe(types_1.TaskStatus.FAILED);
        (0, vitest_1.expect)(ctx.savedTasks).toHaveLength(2);
    });
    (0, vitest_1.it)('does not mark done tasks as FAILED when session dies', async () => {
        const task = makeTask('task-1234567890123-abcdef', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'done',
            status: types_1.TaskStatus.COMPLETED,
            tmuxSessionName: 'test-lane',
            tmuxWindowIndex: '1',
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        const lane = makeLane({ sessionActive: true });
        const ctx = makeMockContext([task], [lane], []);
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        // Done task should not be affected
        (0, vitest_1.expect)(task.status).toBe(types_1.TaskStatus.COMPLETED);
        (0, vitest_1.expect)(task.tmuxSessionName).toBe('test-lane');
        (0, vitest_1.expect)(ctx.savedTasks).toHaveLength(0);
    });
    (0, vitest_1.it)('does not mark tasks bound to a different server as FAILED', async () => {
        const task = makeTask('task-1234567890123-abcdef', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
            status: types_1.TaskStatus.IN_PROGRESS,
            tmuxSessionName: 'test-lane',
            tmuxWindowIndex: '1',
            tmuxPaneIndex: '0',
            tmuxServerId: 'remote:other-host',
        });
        const lane = makeLane({ sessionActive: true, serverId: 'local' });
        const ctx = makeMockContext([task], [lane], []);
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        // Task is bound to a different server — should not be affected
        (0, vitest_1.expect)(task.status).toBe(types_1.TaskStatus.IN_PROGRESS);
        (0, vitest_1.expect)(task.tmuxSessionName).toBe('test-lane');
        (0, vitest_1.expect)(ctx.savedTasks).toHaveLength(0);
    });
    (0, vitest_1.it)('does not mark unbound tasks as FAILED when session dies', async () => {
        const task = makeTask('task-1234567890123-abcdef', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
            status: types_1.TaskStatus.IN_PROGRESS,
            // No tmux references — task was never attached
        });
        const lane = makeLane({ sessionActive: true });
        const ctx = makeMockContext([task], [lane], []);
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        // Task has no tmux binding — should not be affected
        (0, vitest_1.expect)(task.status).toBe(types_1.TaskStatus.IN_PROGRESS);
        (0, vitest_1.expect)(ctx.savedTasks).toHaveLength(0);
    });
    (0, vitest_1.it)('handles session death for lane that was already inactive', async () => {
        const task = makeTask('task-1234567890123-abcdef', {
            swimLaneId: 'lane-1',
            kanbanColumn: 'in_progress',
            status: types_1.TaskStatus.IN_PROGRESS,
            tmuxSessionName: 'test-lane',
            tmuxWindowIndex: '1',
            tmuxPaneIndex: '0',
            tmuxServerId: 'local',
        });
        // Lane was already marked inactive from a previous cycle
        const lane = makeLane({ sessionActive: false });
        const ctx = makeMockContext([task], [lane], []);
        await (0, sessionSync_1.syncTaskListAttachments)(ctx);
        // Task should still be marked as FAILED (orphan cleanup is idempotent)
        (0, vitest_1.expect)(task.status).toBe(types_1.TaskStatus.FAILED);
        (0, vitest_1.expect)(task.errorMessage).toBe('Tmux session no longer exists');
        (0, vitest_1.expect)(task.tmuxSessionName).toBeUndefined();
    });
});
//# sourceMappingURL=sessionSync.test.js.map