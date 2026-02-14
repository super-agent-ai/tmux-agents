"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// Mock child_process and fs before importing handlers
vitest_1.vi.mock('child_process', () => {
    const mockExec = vitest_1.vi.fn();
    return { exec: mockExec };
});
vitest_1.vi.mock('fs', () => ({ existsSync: vitest_1.vi.fn(() => true) }));
const kanbanHandlers_1 = require("../commands/kanbanHandlers");
const types_1 = require("../core/types");
const kanbanView_1 = require("../kanbanView");
const vscode = __importStar(require("vscode"));
// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeTask(id, overrides = {}) {
    return {
        id,
        description: `Task ${id}`,
        status: types_1.TaskStatus.PENDING,
        priority: 5,
        createdAt: Date.now(),
        verificationStatus: 'none',
        ...overrides,
    };
}
function makeLane(id, overrides = {}) {
    return {
        id,
        name: `Lane ${id}`,
        serverId: 'local',
        workingDirectory: '~/project',
        sessionName: `session-${id}`,
        createdAt: Date.now(),
        ...overrides,
    };
}
function makeServiceMock(overrides = {}) {
    return {
        execCommand: vitest_1.vi.fn(async () => ''),
        killWindow: vitest_1.vi.fn(async () => { }),
        serverIdentity: { id: 'local', label: 'Local', isLocal: true },
        ...overrides,
    };
}
function makeCtx(tasks, lanes = [], overrides = {}) {
    return {
        serviceManager: {
            getService: vitest_1.vi.fn(() => makeServiceMock()),
        },
        tmuxSessionProvider: { refresh: vitest_1.vi.fn() },
        smartAttachment: {},
        aiManager: {
            getDefaultProvider: vitest_1.vi.fn(() => 'claude'),
            getSpawnConfig: vitest_1.vi.fn(() => ({
                command: 'claude',
                args: ['--print', '-'],
                env: {},
                cwd: '/tmp',
            })),
            resolveProvider: vitest_1.vi.fn(() => 'claude'),
            resolveModel: vitest_1.vi.fn(() => 'opus'),
        },
        orchestrator: {
            submitTask: vitest_1.vi.fn((task) => { tasks.push(task); }),
            getTask: vitest_1.vi.fn((id) => tasks.find(t => t.id === id)),
            getTaskQueue: vitest_1.vi.fn(() => tasks),
        },
        teamManager: {},
        kanbanView: {
            sendMessage: vitest_1.vi.fn(),
        },
        database: {
            saveTask: vitest_1.vi.fn(),
            saveSwimLane: vitest_1.vi.fn(),
            addStatusHistory: vitest_1.vi.fn(),
        },
        swimLanes: lanes,
        favouriteFolders: [],
        updateKanban: vitest_1.vi.fn(),
        updateDashboard: vitest_1.vi.fn(async () => { }),
        ensureLaneSession: vitest_1.vi.fn(async () => true),
        startTaskFlow: vitest_1.vi.fn(async () => { }),
        buildTaskWindowName: vitest_1.vi.fn(() => 'task-window'),
        cleanupInitWindow: vitest_1.vi.fn(async () => { }),
        ...overrides,
    };
}
// ─── UI Tests ────────────────────────────────────────────────────────────────
(0, vitest_1.describe)('Worktree Cleanup Button UI', () => {
    let provider;
    let html;
    (0, vitest_1.beforeEach)(() => {
        const extUri = { fsPath: '/test' };
        provider = new kanbanView_1.KanbanViewProvider(extUri);
        html = provider.getHtml();
    });
    (0, vitest_1.it)('renders sweeper icon (broom) for cleanup worktree card button', () => {
        (0, vitest_1.expect)(html).toContain('&#x1F9F9;');
    });
    (0, vitest_1.it)('has cleanup-worktree data-act attribute in buildCard', () => {
        (0, vitest_1.expect)(html).toContain('data-act="cleanup-worktree"');
    });
    (0, vitest_1.it)('conditionally renders cleanup button when task has worktreePath', () => {
        (0, vitest_1.expect)(html).toContain('task.worktreePath && resolveTaskToggle(task,');
    });
    (0, vitest_1.it)('applies purple color to cleanup worktree button', () => {
        (0, vitest_1.expect)(html).toContain('color:#c586c0');
    });
    (0, vitest_1.it)('has cleanup worktree modal button with id tma-cleanup-worktree', () => {
        (0, vitest_1.expect)(html).toContain('id="tma-cleanup-worktree"');
    });
    (0, vitest_1.it)('sends cleanupWorktree message on card button click', () => {
        (0, vitest_1.expect)(html).toContain("type: 'cleanupWorktree'");
    });
    (0, vitest_1.it)('sends cleanupWorktree message on modal button click', () => {
        // The modal button click handler posts cleanupWorktree message
        (0, vitest_1.expect)(html).toContain("type: 'cleanupWorktree'");
    });
    (0, vitest_1.it)('shows cleanup worktree button tooltip', () => {
        (0, vitest_1.expect)(html).toContain('data-tip="Cleanup Worktree"');
    });
    (0, vitest_1.it)('shows modal cleanup button with descriptive title', () => {
        (0, vitest_1.expect)(html).toContain('title="Cleanup worktree (rebase+merge if done, discard if not)"');
    });
    (0, vitest_1.it)('cleanup button appears after close-window button in card actions', () => {
        const closeWindowIdx = html.indexOf('data-act="close-window"');
        const cleanupIdx = html.indexOf('data-act="cleanup-worktree"');
        (0, vitest_1.expect)(closeWindowIdx).toBeGreaterThan(-1);
        (0, vitest_1.expect)(cleanupIdx).toBeGreaterThan(closeWindowIdx);
    });
    (0, vitest_1.it)('modal cleanup button appears between close-window and delete buttons', () => {
        const closeWindowModalIdx = html.indexOf('id="tma-close-window"');
        const cleanupModalIdx = html.indexOf('id="tma-cleanup-worktree"');
        const deleteModalIdx = html.indexOf('id="tma-delete"');
        (0, vitest_1.expect)(closeWindowModalIdx).toBeGreaterThan(-1);
        (0, vitest_1.expect)(cleanupModalIdx).toBeGreaterThan(closeWindowModalIdx);
        (0, vitest_1.expect)(deleteModalIdx).toBeGreaterThan(cleanupModalIdx);
    });
    (0, vitest_1.it)('modal button visibility is tied to task.worktreePath', () => {
        // The visibility logic: tmaCleanupWorktree.style.display = task.worktreePath ? '' : 'none';
        (0, vitest_1.expect)(html).toContain("tmaCleanupWorktree.style.display = task.worktreePath ? '' : 'none'");
    });
});
// ─── Handler Tests ──────────────────────────────────────────────────────────
(0, vitest_1.describe)('cleanupWorktree handler', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('does nothing if task has no worktreePath', async () => {
        const task = makeTask('task-00000001', { useWorktree: true });
        const ctx = makeCtx([task]);
        await (0, kanbanHandlers_1.handleKanbanMessage)('cleanupWorktree', { taskId: 'task-00000001' }, ctx);
        (0, vitest_1.expect)(ctx.updateKanban).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('does nothing if task is not found', async () => {
        const ctx = makeCtx([]);
        await (0, kanbanHandlers_1.handleKanbanMessage)('cleanupWorktree', { taskId: 'nonexistent' }, ctx);
        (0, vitest_1.expect)(ctx.updateKanban).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('shows confirmation dialog for incomplete task worktree discard', async () => {
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'in_progress',
            status: types_1.TaskStatus.IN_PROGRESS,
            tmuxServerId: 'local',
            swimLaneId: 'lane-1',
        });
        const lane = makeLane('lane-1');
        const ctx = makeCtx([task], [lane]);
        // User cancels
        vscode.window.showWarningMessage.mockResolvedValueOnce(undefined);
        await (0, kanbanHandlers_1.handleKanbanMessage)('cleanupWorktree', { taskId: 'task-00000001' }, ctx);
        (0, vitest_1.expect)(vscode.window.showWarningMessage).toHaveBeenCalledWith(vitest_1.expect.stringContaining('Discard worktree'), { modal: true }, 'Discard Worktree');
        // Task not modified since user cancelled
        (0, vitest_1.expect)(task.worktreePath).toBe('/repo/.worktrees/task-00000001');
    });
    (0, vitest_1.it)('discards worktree and branch for incomplete task when confirmed', async () => {
        const execCommand = vitest_1.vi.fn(async () => '/home/user/project\n');
        const killWindow = vitest_1.vi.fn(async () => { });
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'in_progress',
            status: types_1.TaskStatus.IN_PROGRESS,
            tmuxServerId: 'local',
            tmuxSessionName: 'my-session',
            tmuxWindowIndex: '2',
            tmuxPaneIndex: '0',
            swimLaneId: 'lane-1',
        });
        const lane = makeLane('lane-1', { workingDirectory: '/home/user/project' });
        const ctx = makeCtx([task], [lane], {
            serviceManager: {
                getService: vitest_1.vi.fn(() => ({
                    execCommand,
                    killWindow,
                    serverIdentity: { id: 'local', label: 'Local', isLocal: true },
                })),
            },
        });
        vscode.window.showWarningMessage.mockResolvedValueOnce('Discard Worktree');
        await (0, kanbanHandlers_1.handleKanbanMessage)('cleanupWorktree', { taskId: 'task-00000001' }, ctx);
        // Tmux window was killed
        (0, vitest_1.expect)(killWindow).toHaveBeenCalledWith('my-session', '2');
        // Worktree remove command was called
        (0, vitest_1.expect)(execCommand).toHaveBeenCalledWith(vitest_1.expect.stringContaining('worktree remove'));
        // Branch delete command was called
        (0, vitest_1.expect)(execCommand).toHaveBeenCalledWith(vitest_1.expect.stringContaining('branch -D'));
        // Task worktreePath cleared
        (0, vitest_1.expect)(task.worktreePath).toBeUndefined();
        // Task tmux properties cleared
        (0, vitest_1.expect)(task.tmuxSessionName).toBeUndefined();
        (0, vitest_1.expect)(task.tmuxWindowIndex).toBeUndefined();
        (0, vitest_1.expect)(task.tmuxPaneIndex).toBeUndefined();
        (0, vitest_1.expect)(task.tmuxServerId).toBeUndefined();
        // Task saved
        (0, vitest_1.expect)(ctx.database.saveTask).toHaveBeenCalledWith(task);
        // Tree and kanban updated
        (0, vitest_1.expect)(ctx.tmuxSessionProvider.refresh).toHaveBeenCalled();
        (0, vitest_1.expect)(ctx.updateKanban).toHaveBeenCalled();
    });
    (0, vitest_1.it)('shows confirmation dialog for completed task rebase+merge', async () => {
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'done',
            status: types_1.TaskStatus.COMPLETED,
            tmuxServerId: 'local',
            swimLaneId: 'lane-1',
        });
        const lane = makeLane('lane-1');
        const ctx = makeCtx([task], [lane]);
        // User cancels
        vscode.window.showInformationMessage.mockResolvedValueOnce(undefined);
        await (0, kanbanHandlers_1.handleKanbanMessage)('cleanupWorktree', { taskId: 'task-00000001' }, ctx);
        (0, vitest_1.expect)(vscode.window.showInformationMessage).toHaveBeenCalledWith(vitest_1.expect.stringContaining('rebase'), { modal: true }, 'Rebase & Merge');
        (0, vitest_1.expect)(task.worktreePath).toBe('/repo/.worktrees/task-00000001');
    });
    (0, vitest_1.it)('rebases, merges and cleans up worktree for completed task when confirmed', async () => {
        const execCommand = vitest_1.vi.fn(async () => '/home/user/project\n');
        const killWindow = vitest_1.vi.fn(async () => { });
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'done',
            status: types_1.TaskStatus.COMPLETED,
            tmuxServerId: 'local',
            tmuxSessionName: 'my-session',
            tmuxWindowIndex: '3',
            tmuxPaneIndex: '0',
            swimLaneId: 'lane-1',
        });
        const lane = makeLane('lane-1', { workingDirectory: '/home/user/project' });
        const ctx = makeCtx([task], [lane], {
            serviceManager: {
                getService: vitest_1.vi.fn(() => ({
                    execCommand,
                    killWindow,
                    serverIdentity: { id: 'local', label: 'Local', isLocal: true },
                })),
            },
        });
        vscode.window.showInformationMessage.mockResolvedValueOnce('Rebase & Merge');
        await (0, kanbanHandlers_1.handleKanbanMessage)('cleanupWorktree', { taskId: 'task-00000001' }, ctx);
        // Rebase command was run in worktree directory
        (0, vitest_1.expect)(execCommand).toHaveBeenCalledWith(vitest_1.expect.stringContaining('rebase main'));
        // Tmux window killed before worktree removal
        (0, vitest_1.expect)(killWindow).toHaveBeenCalledWith('my-session', '3');
        // Checkout main in main repo
        (0, vitest_1.expect)(execCommand).toHaveBeenCalledWith(vitest_1.expect.stringContaining('checkout main'));
        // Merge branch into main
        (0, vitest_1.expect)(execCommand).toHaveBeenCalledWith(vitest_1.expect.stringContaining('merge task-'));
        // Worktree remove
        (0, vitest_1.expect)(execCommand).toHaveBeenCalledWith(vitest_1.expect.stringContaining('worktree remove'));
        // Task worktreePath cleared
        (0, vitest_1.expect)(task.worktreePath).toBeUndefined();
        // Task tmux properties cleared
        (0, vitest_1.expect)(task.tmuxSessionName).toBeUndefined();
        (0, vitest_1.expect)(task.tmuxWindowIndex).toBeUndefined();
        (0, vitest_1.expect)(task.tmuxPaneIndex).toBeUndefined();
        (0, vitest_1.expect)(task.tmuxServerId).toBeUndefined();
        // Task saved
        (0, vitest_1.expect)(ctx.database.saveTask).toHaveBeenCalledWith(task);
        // Tree and kanban refreshed
        (0, vitest_1.expect)(ctx.tmuxSessionProvider.refresh).toHaveBeenCalled();
        (0, vitest_1.expect)(ctx.updateKanban).toHaveBeenCalled();
        // Success message shown
        (0, vitest_1.expect)(vscode.window.showInformationMessage).toHaveBeenCalledWith(vitest_1.expect.stringContaining('merged into main'));
    });
    (0, vitest_1.it)('shows warning when rebase fails', async () => {
        const execCommand = vitest_1.vi.fn(async (cmd) => {
            if (cmd.includes('rebase')) {
                throw new Error('Rebase conflict');
            }
            return '/home/user/project\n';
        });
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'done',
            status: types_1.TaskStatus.COMPLETED,
            tmuxServerId: 'local',
            swimLaneId: 'lane-1',
        });
        const lane = makeLane('lane-1', { workingDirectory: '/home/user/project' });
        const ctx = makeCtx([task], [lane], {
            serviceManager: {
                getService: vitest_1.vi.fn(() => ({
                    execCommand,
                    killWindow: vitest_1.vi.fn(async () => { }),
                    serverIdentity: { id: 'local', label: 'Local', isLocal: true },
                })),
            },
        });
        vscode.window.showInformationMessage.mockResolvedValueOnce('Rebase & Merge');
        await (0, kanbanHandlers_1.handleKanbanMessage)('cleanupWorktree', { taskId: 'task-00000001' }, ctx);
        (0, vitest_1.expect)(vscode.window.showWarningMessage).toHaveBeenCalledWith(vitest_1.expect.stringContaining('cleanup failed'));
        // worktreePath NOT cleared on failure
        (0, vitest_1.expect)(task.worktreePath).toBe('/repo/.worktrees/task-00000001');
    });
    (0, vitest_1.it)('infers main repo dir from git when lane is not available', async () => {
        const execCommand = vitest_1.vi.fn(async (cmd) => {
            if (cmd.includes('rev-parse')) {
                return '/home/user/project/.git\n';
            }
            if (cmd.includes('cd ')) {
                return '/home/user/project\n';
            }
            return '';
        });
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'in_progress',
            status: types_1.TaskStatus.IN_PROGRESS,
            tmuxServerId: 'local',
        });
        const ctx = makeCtx([task], [], {
            serviceManager: {
                getService: vitest_1.vi.fn(() => ({
                    execCommand,
                    killWindow: vitest_1.vi.fn(async () => { }),
                    serverIdentity: { id: 'local', label: 'Local', isLocal: true },
                })),
            },
        });
        vscode.window.showWarningMessage.mockResolvedValueOnce('Discard Worktree');
        await (0, kanbanHandlers_1.handleKanbanMessage)('cleanupWorktree', { taskId: 'task-00000001' }, ctx);
        // git rev-parse was called to find main repo
        (0, vitest_1.expect)(execCommand).toHaveBeenCalledWith(vitest_1.expect.stringContaining('rev-parse'));
    });
    (0, vitest_1.it)('uses lane serverId when task has no tmuxServerId', async () => {
        const execCommand = vitest_1.vi.fn(async () => '/home/user/project\n');
        const svcMock = {
            execCommand,
            killWindow: vitest_1.vi.fn(async () => { }),
            serverIdentity: { id: 'remote:myserver', label: 'MyServer', isLocal: false },
        };
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'in_progress',
            status: types_1.TaskStatus.IN_PROGRESS,
            swimLaneId: 'lane-1',
            // No tmuxServerId
        });
        const lane = makeLane('lane-1', { serverId: 'remote:myserver', workingDirectory: '/home/user/project' });
        const getService = vitest_1.vi.fn(() => svcMock);
        const ctx = makeCtx([task], [lane], {
            serviceManager: { getService },
        });
        vscode.window.showWarningMessage.mockResolvedValueOnce('Discard Worktree');
        await (0, kanbanHandlers_1.handleKanbanMessage)('cleanupWorktree', { taskId: 'task-00000001' }, ctx);
        // Used the lane's serverId to get the service
        (0, vitest_1.expect)(getService).toHaveBeenCalledWith('remote:myserver');
    });
    (0, vitest_1.it)('handles task without tmux window gracefully during discard', async () => {
        const execCommand = vitest_1.vi.fn(async () => '/home/user/project\n');
        const killWindow = vitest_1.vi.fn(async () => { });
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'todo',
            status: types_1.TaskStatus.PENDING,
            swimLaneId: 'lane-1',
            // No tmux properties — task never started
        });
        const lane = makeLane('lane-1', { workingDirectory: '/home/user/project' });
        const ctx = makeCtx([task], [lane], {
            serviceManager: {
                getService: vitest_1.vi.fn(() => ({
                    execCommand,
                    killWindow,
                    serverIdentity: { id: 'local', label: 'Local', isLocal: true },
                })),
            },
        });
        vscode.window.showWarningMessage.mockResolvedValueOnce('Discard Worktree');
        await (0, kanbanHandlers_1.handleKanbanMessage)('cleanupWorktree', { taskId: 'task-00000001' }, ctx);
        // killWindow should NOT be called since there's no tmux session
        (0, vitest_1.expect)(killWindow).not.toHaveBeenCalled();
        // But worktree should still be removed
        (0, vitest_1.expect)(execCommand).toHaveBeenCalledWith(vitest_1.expect.stringContaining('worktree remove'));
        (0, vitest_1.expect)(task.worktreePath).toBeUndefined();
        (0, vitest_1.expect)(ctx.database.saveTask).toHaveBeenCalledWith(task);
    });
    (0, vitest_1.it)('treats COMPLETED status as done even if kanbanColumn is not done', async () => {
        const execCommand = vitest_1.vi.fn(async () => '/home/user/project\n');
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'in_review',
            status: types_1.TaskStatus.COMPLETED,
            swimLaneId: 'lane-1',
        });
        const lane = makeLane('lane-1', { workingDirectory: '/home/user/project' });
        const ctx = makeCtx([task], [lane], {
            serviceManager: {
                getService: vitest_1.vi.fn(() => ({
                    execCommand,
                    killWindow: vitest_1.vi.fn(async () => { }),
                    serverIdentity: { id: 'local', label: 'Local', isLocal: true },
                })),
            },
        });
        // User cancels — we just want to verify the right dialog was shown
        vscode.window.showInformationMessage.mockResolvedValueOnce(undefined);
        await (0, kanbanHandlers_1.handleKanbanMessage)('cleanupWorktree', { taskId: 'task-00000001' }, ctx);
        // Should show the rebase & merge dialog (completed path), not discard
        (0, vitest_1.expect)(vscode.window.showInformationMessage).toHaveBeenCalledWith(vitest_1.expect.stringContaining('rebase'), { modal: true }, 'Rebase & Merge');
    });
    (0, vitest_1.it)('treats FAILED status as incomplete and shows discard dialog', async () => {
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'in_progress',
            status: types_1.TaskStatus.FAILED,
            swimLaneId: 'lane-1',
        });
        const lane = makeLane('lane-1');
        const ctx = makeCtx([task], [lane]);
        vscode.window.showWarningMessage.mockResolvedValueOnce(undefined);
        await (0, kanbanHandlers_1.handleKanbanMessage)('cleanupWorktree', { taskId: 'task-00000001' }, ctx);
        (0, vitest_1.expect)(vscode.window.showWarningMessage).toHaveBeenCalledWith(vitest_1.expect.stringContaining('Discard worktree'), { modal: true }, 'Discard Worktree');
    });
});
//# sourceMappingURL=worktreeCleanup.test.js.map