import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process before importing handlers
vi.mock('child_process', () => {
    const mockExec = vi.fn();
    return { exec: mockExec };
});
vi.mock('fs', () => ({ existsSync: vi.fn(() => true) }));

import * as cp from 'child_process';
import { handleKanbanMessage } from '../commands/kanbanHandlers';
import type { KanbanHandlerContext } from '../commands/kanbanHandlers';
import type { OrchestratorTask, KanbanSwimLane } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<KanbanHandlerContext> = {}): KanbanHandlerContext {
    const tasks: OrchestratorTask[] = [];
    return {
        serviceManager: {} as any,
        tmuxSessionProvider: {} as any,
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
        } as any,
        swimLanes: [],
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

const makeLane = (id: string, name: string, overrides: Partial<KanbanSwimLane> = {}): KanbanSwimLane => ({
    id,
    name,
    serverId: 'local',
    workingDirectory: '~/project',
    sessionName: `session-${id}`,
    createdAt: Date.now(),
    ...overrides,
});

// ─── generateTask ─────────────────────────────────────────────────────────────

describe('generateTask handler', () => {
    let ctx: KanbanHandlerContext;

    beforeEach(() => {
        vi.clearAllMocks();
        ctx = makeCtx();
    });

    it('spawns AI CLI and parses full JSON task object', async () => {
        const mockTask = {
            title: 'Add user authentication',
            description: 'Implement JWT-based authentication with login/logout endpoints.',
            role: 'coder',
            priority: 7,
            tags: ['feature'],
            autoStart: true,
            autoPilot: true,
            autoClose: false,
            useWorktree: true,
            aiProvider: '',
            aiModel: '',
        };
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generateTask', {
            text: 'add auth',
            swimLaneId: '',
        }, ctx);

        expect(ctx.kanbanView.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'generateTaskResult',
                task: expect.objectContaining({
                    title: 'Add user authentication',
                    description: expect.stringContaining('JWT'),
                    role: 'coder',
                    priority: 7,
                    tags: ['feature'],
                    autoStart: true,
                    autoPilot: true,
                    autoClose: false,
                    useWorktree: true,
                    aiProvider: '',
                    aiModel: '',
                }),
            })
        );
    });

    it('handles AI errors gracefully', async () => {
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(new Error('command not found'), '', 'command not found');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);

        expect(ctx.kanbanView.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'generateTaskResult',
                error: expect.stringContaining('AI command failed'),
            })
        );
    });

    it('handles malformed JSON from AI', async () => {
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, 'This is not JSON at all', '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);

        expect(ctx.kanbanView.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'generateTaskResult',
                error: expect.stringContaining('Failed to parse'),
            })
        );
    });

    it('strips code fences from AI response', async () => {
        const mockTask = { title: 'Fix login bug', description: 'desc', role: 'coder', priority: 8, tags: ['bug'], autoStart: true, autoPilot: false, autoClose: false, useWorktree: false, aiProvider: '', aiModel: '' };
        const fenced = '```json\n' + JSON.stringify(mockTask) + '\n```';
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, fenced, '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generateTask', {
            text: 'fix login',
            swimLaneId: '',
        }, ctx);

        const call = (ctx.kanbanView.sendMessage as any).mock.calls[0][0];
        expect(call.type).toBe('generateTaskResult');
        expect(call.task.title).toBe('Fix login bug');
        expect(call.task.priority).toBe(8);
    });

    it('clamps priority to valid range (1-10)', async () => {
        const mockTask = { title: 'Task', description: 'desc', role: 'coder', priority: 15, tags: [] };
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);

        const call = (ctx.kanbanView.sendMessage as any).mock.calls[0][0];
        expect(call.task.priority).toBe(10);
    });

    it('validates role against allowed list', async () => {
        const mockTask = { title: 'Task', description: 'desc', role: 'hacker', priority: 5, tags: [] };
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);

        const call = (ctx.kanbanView.sendMessage as any).mock.calls[0][0];
        expect(call.task.role).toBe('');
    });

    it('truncates title to 60 characters', async () => {
        const longTitle = 'A'.repeat(100);
        const mockTask = { title: longTitle, description: 'desc', role: 'coder', priority: 5, tags: [] };
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);

        const call = (ctx.kanbanView.sendMessage as any).mock.calls[0][0];
        expect(call.task.title).toHaveLength(60);
    });

    it('limits tags to 5', async () => {
        const mockTask = { title: 'Task', description: 'desc', role: '', priority: 5, tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] };
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);

        const call = (ctx.kanbanView.sendMessage as any).mock.calls[0][0];
        expect(call.task.tags).toHaveLength(5);
    });

    it('validates aiProvider against allowed list', async () => {
        const mockTask = { title: 'Task', description: 'desc', role: '', priority: 5, tags: [], aiProvider: 'invalid-provider', aiModel: 'gpt-5' };
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);

        const call = (ctx.kanbanView.sendMessage as any).mock.calls[0][0];
        expect(call.task.aiProvider).toBe('');
        expect(call.task.aiModel).toBe('gpt-5');
    });

    it('accepts valid aiProvider', async () => {
        const mockTask = { title: 'Task', description: 'desc', role: '', priority: 5, tags: [], aiProvider: 'gemini', aiModel: 'gemini-2.5-pro' };
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);

        const call = (ctx.kanbanView.sendMessage as any).mock.calls[0][0];
        expect(call.task.aiProvider).toBe('gemini');
        expect(call.task.aiModel).toBe('gemini-2.5-pro');
    });

    it('includes toggle values in response', async () => {
        const mockTask = {
            title: 'Risky refactor', description: 'desc', role: 'coder', priority: 6, tags: ['refactor'],
            autoStart: true, autoPilot: false, autoClose: false, useWorktree: true,
            aiProvider: '', aiModel: ''
        };
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generateTask', {
            text: 'risky refactor of auth module',
            swimLaneId: '',
        }, ctx);

        const call = (ctx.kanbanView.sendMessage as any).mock.calls[0][0];
        expect(call.task.autoStart).toBe(true);
        expect(call.task.autoPilot).toBe(false);
        expect(call.task.autoClose).toBe(false);
        expect(call.task.useWorktree).toBe(true);
    });

    it('includes swim lane context with toggles in prompt', async () => {
        const lane = makeLane('lane1', 'Auth Project', {
            contextInstructions: 'Use TypeScript and Express',
            aiProvider: 'claude' as any,
            aiModel: 'opus',
            defaultToggles: { autoStart: true, autoPilot: true, autoClose: false, useWorktree: false },
        });
        ctx = makeCtx({ swimLanes: [lane] });

        let capturedPrompt = '';
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            const stdinWrite = vi.fn((data: string) => { capturedPrompt = data; });
            const proc = {
                stdin: { on: vi.fn(), write: stdinWrite, end: vi.fn(), writable: true },
                killed: false,
            };
            setTimeout(() => cb(null, JSON.stringify({ title: 'T', description: 'd', role: '', priority: 5, tags: [] }), ''), 10);
            return proc;
        });

        await handleKanbanMessage('generateTask', {
            text: 'add login page',
            swimLaneId: 'lane1',
        }, ctx);

        expect(capturedPrompt).toContain('Auth Project');
        expect(capturedPrompt).toContain('Use TypeScript and Express');
        expect(capturedPrompt).toContain('autoStart=on');
        expect(capturedPrompt).toContain('autoPilot=on');
        expect(capturedPrompt).toContain('Lane default AI provider: claude');
    });

    it('does nothing when text is empty', async () => {
        await handleKanbanMessage('generateTask', {
            text: '',
            swimLaneId: '',
        }, ctx);

        expect(cp.exec).not.toHaveBeenCalled();
        expect(ctx.kanbanView.sendMessage).not.toHaveBeenCalled();
    });

    it('treats non-boolean toggle values as undefined', async () => {
        const mockTask = {
            title: 'Task', description: 'desc', role: '', priority: 5, tags: [],
            autoStart: 'yes', autoPilot: 1, autoClose: null, useWorktree: undefined,
            aiProvider: '', aiModel: ''
        };
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);

        const call = (ctx.kanbanView.sendMessage as any).mock.calls[0][0];
        // Non-boolean values should be treated as undefined (not set)
        expect(call.task.autoStart).toBeUndefined();
        expect(call.task.autoPilot).toBeUndefined();
        expect(call.task.autoClose).toBeUndefined();
        expect(call.task.useWorktree).toBeUndefined();
    });
});
