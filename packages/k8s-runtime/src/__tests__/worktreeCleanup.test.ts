import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process and fs before importing handlers
vi.mock('child_process', () => {
    const mockExec = vi.fn();
    return { exec: mockExec };
});
vi.mock('fs', () => ({ existsSync: vi.fn(() => true) }));

import { handleKanbanMessage } from '../commands/kanbanHandlers';
import type { KanbanHandlerContext } from '../commands/kanbanHandlers';
import { TaskStatus } from '../types';
import type { OrchestratorTask, KanbanSwimLane } from '../types';
import { KanbanViewProvider } from '../kanbanView';
import * as vscode from 'vscode';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTask(id: string, overrides: Partial<OrchestratorTask> = {}): OrchestratorTask {
    return {
        id,
        description: `Task ${id}`,
        status: TaskStatus.PENDING,
        priority: 5,
        createdAt: Date.now(),
        verificationStatus: 'none',
        ...overrides,
    };
}

function makeLane(id: string, overrides: Partial<KanbanSwimLane> = {}): KanbanSwimLane {
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

function makeServiceMock(overrides: Record<string, any> = {}) {
    return {
        execCommand: vi.fn(async () => ''),
        killWindow: vi.fn(async () => {}),
        serverIdentity: { id: 'local', label: 'Local', isLocal: true },
        ...overrides,
    };
}

function makeCtx(tasks: OrchestratorTask[], lanes: KanbanSwimLane[] = [], overrides: Partial<KanbanHandlerContext> = {}): KanbanHandlerContext {
    return {
        serviceManager: {
            getService: vi.fn(() => makeServiceMock()),
        } as any,
        tmuxSessionProvider: { refresh: vi.fn() } as any,
        smartAttachment: {} as any,
        aiManager: {
            getDefaultProvider: vi.fn(() => 'claude'),
            getSpawnConfig: vi.fn(() => ({
                command: 'claude',
                args: ['--print', '-'],
                env: {},
                cwd: '/tmp',
            })),
            resolveProvider: vi.fn(() => 'claude'),
            resolveModel: vi.fn(() => 'opus'),
        } as any,
        orchestrator: {
            submitTask: vi.fn((task: OrchestratorTask) => { tasks.push(task); }),
            getTask: vi.fn((id: string) => tasks.find(t => t.id === id)),
            getTaskQueue: vi.fn(() => tasks),
        } as any,
        teamManager: {} as any,
        kanbanView: {
            sendMessage: vi.fn(),
        } as any,
        database: {
            saveTask: vi.fn(),
            saveSwimLane: vi.fn(),
            addStatusHistory: vi.fn(),
        } as any,
        swimLanes: lanes,
        favouriteFolders: [],
        updateKanban: vi.fn(),
        updateDashboard: vi.fn(async () => {}),
        ensureLaneSession: vi.fn(async () => true),
        startTaskFlow: vi.fn(async () => {}),
        buildTaskWindowName: vi.fn(() => 'task-window'),
        cleanupInitWindow: vi.fn(async () => {}),
        ...overrides,
    };
}

// ─── UI Tests ────────────────────────────────────────────────────────────────

describe('Worktree Cleanup Button UI', () => {
    let provider: KanbanViewProvider;
    let html: string;

    beforeEach(() => {
        const extUri = { fsPath: '/test' } as vscode.Uri;
        provider = new KanbanViewProvider(extUri);
        html = (provider as any).getHtml() as string;
    });

    it('renders sweeper icon (broom) for cleanup worktree card button', () => {
        expect(html).toContain('&#x1F9F9;');
    });

    it('has cleanup-worktree data-act attribute in buildCard', () => {
        expect(html).toContain('data-act="cleanup-worktree"');
    });

    it('conditionally renders cleanup button when task has worktreePath', () => {
        expect(html).toContain('task.worktreePath && resolveTaskToggle(task,');
    });

    it('applies purple color to cleanup worktree button', () => {
        expect(html).toContain('color:#c586c0');
    });

    it('has cleanup worktree modal button with id tma-cleanup-worktree', () => {
        expect(html).toContain('id="tma-cleanup-worktree"');
    });

    it('sends cleanupWorktree message on card button click', () => {
        expect(html).toContain("type: 'cleanupWorktree'");
    });

    it('sends cleanupWorktree message on modal button click', () => {
        // The modal button click handler posts cleanupWorktree message
        expect(html).toContain("type: 'cleanupWorktree'");
    });

    it('shows cleanup worktree button tooltip', () => {
        expect(html).toContain('data-tip="Cleanup Worktree"');
    });

    it('shows modal cleanup button with descriptive title', () => {
        expect(html).toContain('title="Cleanup worktree (rebase+merge if done, discard if not)"');
    });

    it('cleanup button appears after close-window button in card actions', () => {
        const closeWindowIdx = html.indexOf('data-act="close-window"');
        const cleanupIdx = html.indexOf('data-act="cleanup-worktree"');
        expect(closeWindowIdx).toBeGreaterThan(-1);
        expect(cleanupIdx).toBeGreaterThan(closeWindowIdx);
    });

    it('modal cleanup button appears between close-window and delete buttons', () => {
        const closeWindowModalIdx = html.indexOf('id="tma-close-window"');
        const cleanupModalIdx = html.indexOf('id="tma-cleanup-worktree"');
        const deleteModalIdx = html.indexOf('id="tma-delete"');
        expect(closeWindowModalIdx).toBeGreaterThan(-1);
        expect(cleanupModalIdx).toBeGreaterThan(closeWindowModalIdx);
        expect(deleteModalIdx).toBeGreaterThan(cleanupModalIdx);
    });

    it('modal button visibility is tied to task.worktreePath', () => {
        // The visibility logic: tmaCleanupWorktree.style.display = task.worktreePath ? '' : 'none';
        expect(html).toContain("tmaCleanupWorktree.style.display = task.worktreePath ? '' : 'none'");
    });
});

// ─── Handler Tests ──────────────────────────────────────────────────────────

describe('cleanupWorktree handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does nothing if task has no worktreePath', async () => {
        const task = makeTask('task-00000001', { useWorktree: true });
        const ctx = makeCtx([task]);

        await handleKanbanMessage('cleanupWorktree', { taskId: 'task-00000001' }, ctx);

        expect(ctx.updateKanban).not.toHaveBeenCalled();
    });

    it('does nothing if task is not found', async () => {
        const ctx = makeCtx([]);

        await handleKanbanMessage('cleanupWorktree', { taskId: 'nonexistent' }, ctx);

        expect(ctx.updateKanban).not.toHaveBeenCalled();
    });

    it('shows confirmation dialog for incomplete task worktree discard', async () => {
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'in_progress',
            status: TaskStatus.IN_PROGRESS,
            tmuxServerId: 'local',
            swimLaneId: 'lane-1',
        });
        const lane = makeLane('lane-1');
        const ctx = makeCtx([task], [lane]);

        // User cancels
        (vscode.window.showWarningMessage as any).mockResolvedValueOnce(undefined);

        await handleKanbanMessage('cleanupWorktree', { taskId: 'task-00000001' }, ctx);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('Discard worktree'),
            { modal: true },
            'Discard Worktree'
        );
        // Task not modified since user cancelled
        expect(task.worktreePath).toBe('/repo/.worktrees/task-00000001');
    });

    it('discards worktree and branch for incomplete task when confirmed', async () => {
        const execCommand = vi.fn(async () => '/home/user/project\n');
        const killWindow = vi.fn(async () => {});
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'in_progress',
            status: TaskStatus.IN_PROGRESS,
            tmuxServerId: 'local',
            tmuxSessionName: 'my-session',
            tmuxWindowIndex: '2',
            tmuxPaneIndex: '0',
            swimLaneId: 'lane-1',
        });
        const lane = makeLane('lane-1', { workingDirectory: '/home/user/project' });
        const ctx = makeCtx([task], [lane], {
            serviceManager: {
                getService: vi.fn(() => ({
                    execCommand,
                    killWindow,
                    serverIdentity: { id: 'local', label: 'Local', isLocal: true },
                })),
            } as any,
        });

        (vscode.window.showWarningMessage as any).mockResolvedValueOnce('Discard Worktree');

        await handleKanbanMessage('cleanupWorktree', { taskId: 'task-00000001' }, ctx);

        // Tmux window was killed
        expect(killWindow).toHaveBeenCalledWith('my-session', '2');
        // Worktree remove command was called
        expect(execCommand).toHaveBeenCalledWith(expect.stringContaining('worktree remove'));
        // Branch delete command was called
        expect(execCommand).toHaveBeenCalledWith(expect.stringContaining('branch -D'));
        // Task worktreePath cleared
        expect(task.worktreePath).toBeUndefined();
        // Task tmux properties cleared
        expect(task.tmuxSessionName).toBeUndefined();
        expect(task.tmuxWindowIndex).toBeUndefined();
        expect(task.tmuxPaneIndex).toBeUndefined();
        expect(task.tmuxServerId).toBeUndefined();
        // Task saved
        expect(ctx.database.saveTask).toHaveBeenCalledWith(task);
        // Tree and kanban updated
        expect(ctx.tmuxSessionProvider.refresh).toHaveBeenCalled();
        expect(ctx.updateKanban).toHaveBeenCalled();
    });

    it('shows confirmation dialog for completed task rebase+merge', async () => {
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'done',
            status: TaskStatus.COMPLETED,
            tmuxServerId: 'local',
            swimLaneId: 'lane-1',
        });
        const lane = makeLane('lane-1');
        const ctx = makeCtx([task], [lane]);

        // User cancels
        (vscode.window.showInformationMessage as any).mockResolvedValueOnce(undefined);

        await handleKanbanMessage('cleanupWorktree', { taskId: 'task-00000001' }, ctx);

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('rebase'),
            { modal: true },
            'Rebase & Merge'
        );
        expect(task.worktreePath).toBe('/repo/.worktrees/task-00000001');
    });

    it('rebases, merges and cleans up worktree for completed task when confirmed', async () => {
        const execCommand = vi.fn(async () => '/home/user/project\n');
        const killWindow = vi.fn(async () => {});
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'done',
            status: TaskStatus.COMPLETED,
            tmuxServerId: 'local',
            tmuxSessionName: 'my-session',
            tmuxWindowIndex: '3',
            tmuxPaneIndex: '0',
            swimLaneId: 'lane-1',
        });
        const lane = makeLane('lane-1', { workingDirectory: '/home/user/project' });
        const ctx = makeCtx([task], [lane], {
            serviceManager: {
                getService: vi.fn(() => ({
                    execCommand,
                    killWindow,
                    serverIdentity: { id: 'local', label: 'Local', isLocal: true },
                })),
            } as any,
        });

        (vscode.window.showInformationMessage as any).mockResolvedValueOnce('Rebase & Merge');

        await handleKanbanMessage('cleanupWorktree', { taskId: 'task-00000001' }, ctx);

        // Rebase command was run in worktree directory
        expect(execCommand).toHaveBeenCalledWith(expect.stringContaining('rebase main'));
        // Tmux window killed before worktree removal
        expect(killWindow).toHaveBeenCalledWith('my-session', '3');
        // Checkout main in main repo
        expect(execCommand).toHaveBeenCalledWith(expect.stringContaining('checkout main'));
        // Merge branch into main
        expect(execCommand).toHaveBeenCalledWith(expect.stringContaining('merge task-'));
        // Worktree remove
        expect(execCommand).toHaveBeenCalledWith(expect.stringContaining('worktree remove'));
        // Task worktreePath cleared
        expect(task.worktreePath).toBeUndefined();
        // Task tmux properties cleared
        expect(task.tmuxSessionName).toBeUndefined();
        expect(task.tmuxWindowIndex).toBeUndefined();
        expect(task.tmuxPaneIndex).toBeUndefined();
        expect(task.tmuxServerId).toBeUndefined();
        // Task saved
        expect(ctx.database.saveTask).toHaveBeenCalledWith(task);
        // Tree and kanban refreshed
        expect(ctx.tmuxSessionProvider.refresh).toHaveBeenCalled();
        expect(ctx.updateKanban).toHaveBeenCalled();
        // Success message shown
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('merged into main')
        );
    });

    it('shows warning when rebase fails', async () => {
        const execCommand = vi.fn(async (cmd: string) => {
            if (cmd.includes('rebase')) { throw new Error('Rebase conflict'); }
            return '/home/user/project\n';
        });
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'done',
            status: TaskStatus.COMPLETED,
            tmuxServerId: 'local',
            swimLaneId: 'lane-1',
        });
        const lane = makeLane('lane-1', { workingDirectory: '/home/user/project' });
        const ctx = makeCtx([task], [lane], {
            serviceManager: {
                getService: vi.fn(() => ({
                    execCommand,
                    killWindow: vi.fn(async () => {}),
                    serverIdentity: { id: 'local', label: 'Local', isLocal: true },
                })),
            } as any,
        });

        (vscode.window.showInformationMessage as any).mockResolvedValueOnce('Rebase & Merge');

        await handleKanbanMessage('cleanupWorktree', { taskId: 'task-00000001' }, ctx);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('cleanup failed')
        );
        // worktreePath NOT cleared on failure
        expect(task.worktreePath).toBe('/repo/.worktrees/task-00000001');
    });

    it('infers main repo dir from git when lane is not available', async () => {
        const execCommand = vi.fn(async (cmd: string) => {
            if (cmd.includes('rev-parse')) { return '/home/user/project/.git\n'; }
            if (cmd.includes('cd ')) { return '/home/user/project\n'; }
            return '';
        });
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'in_progress',
            status: TaskStatus.IN_PROGRESS,
            tmuxServerId: 'local',
        });
        const ctx = makeCtx([task], [], {
            serviceManager: {
                getService: vi.fn(() => ({
                    execCommand,
                    killWindow: vi.fn(async () => {}),
                    serverIdentity: { id: 'local', label: 'Local', isLocal: true },
                })),
            } as any,
        });

        (vscode.window.showWarningMessage as any).mockResolvedValueOnce('Discard Worktree');

        await handleKanbanMessage('cleanupWorktree', { taskId: 'task-00000001' }, ctx);

        // git rev-parse was called to find main repo
        expect(execCommand).toHaveBeenCalledWith(expect.stringContaining('rev-parse'));
    });

    it('uses lane serverId when task has no tmuxServerId', async () => {
        const execCommand = vi.fn(async () => '/home/user/project\n');
        const svcMock = {
            execCommand,
            killWindow: vi.fn(async () => {}),
            serverIdentity: { id: 'remote:myserver', label: 'MyServer', isLocal: false },
        };
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'in_progress',
            status: TaskStatus.IN_PROGRESS,
            swimLaneId: 'lane-1',
            // No tmuxServerId
        });
        const lane = makeLane('lane-1', { serverId: 'remote:myserver', workingDirectory: '/home/user/project' });
        const getService = vi.fn(() => svcMock);
        const ctx = makeCtx([task], [lane], {
            serviceManager: { getService } as any,
        });

        (vscode.window.showWarningMessage as any).mockResolvedValueOnce('Discard Worktree');

        await handleKanbanMessage('cleanupWorktree', { taskId: 'task-00000001' }, ctx);

        // Used the lane's serverId to get the service
        expect(getService).toHaveBeenCalledWith('remote:myserver');
    });

    it('handles task without tmux window gracefully during discard', async () => {
        const execCommand = vi.fn(async () => '/home/user/project\n');
        const killWindow = vi.fn(async () => {});
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'todo',
            status: TaskStatus.PENDING,
            swimLaneId: 'lane-1',
            // No tmux properties — task never started
        });
        const lane = makeLane('lane-1', { workingDirectory: '/home/user/project' });
        const ctx = makeCtx([task], [lane], {
            serviceManager: {
                getService: vi.fn(() => ({
                    execCommand,
                    killWindow,
                    serverIdentity: { id: 'local', label: 'Local', isLocal: true },
                })),
            } as any,
        });

        (vscode.window.showWarningMessage as any).mockResolvedValueOnce('Discard Worktree');

        await handleKanbanMessage('cleanupWorktree', { taskId: 'task-00000001' }, ctx);

        // killWindow should NOT be called since there's no tmux session
        expect(killWindow).not.toHaveBeenCalled();
        // But worktree should still be removed
        expect(execCommand).toHaveBeenCalledWith(expect.stringContaining('worktree remove'));
        expect(task.worktreePath).toBeUndefined();
        expect(ctx.database.saveTask).toHaveBeenCalledWith(task);
    });

    it('treats COMPLETED status as done even if kanbanColumn is not done', async () => {
        const execCommand = vi.fn(async () => '/home/user/project\n');
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'in_review',
            status: TaskStatus.COMPLETED,
            swimLaneId: 'lane-1',
        });
        const lane = makeLane('lane-1', { workingDirectory: '/home/user/project' });
        const ctx = makeCtx([task], [lane], {
            serviceManager: {
                getService: vi.fn(() => ({
                    execCommand,
                    killWindow: vi.fn(async () => {}),
                    serverIdentity: { id: 'local', label: 'Local', isLocal: true },
                })),
            } as any,
        });

        // User cancels — we just want to verify the right dialog was shown
        (vscode.window.showInformationMessage as any).mockResolvedValueOnce(undefined);

        await handleKanbanMessage('cleanupWorktree', { taskId: 'task-00000001' }, ctx);

        // Should show the rebase & merge dialog (completed path), not discard
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('rebase'),
            { modal: true },
            'Rebase & Merge'
        );
    });

    it('treats FAILED status as incomplete and shows discard dialog', async () => {
        const task = makeTask('task-00000001', {
            useWorktree: true,
            worktreePath: '/repo/.worktrees/task-00000001',
            kanbanColumn: 'in_progress',
            status: TaskStatus.FAILED,
            swimLaneId: 'lane-1',
        });
        const lane = makeLane('lane-1');
        const ctx = makeCtx([task], [lane]);

        (vscode.window.showWarningMessage as any).mockResolvedValueOnce(undefined);

        await handleKanbanMessage('cleanupWorktree', { taskId: 'task-00000001' }, ctx);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('Discard worktree'),
            { modal: true },
            'Discard Worktree'
        );
    });
});
