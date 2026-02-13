import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process before importing handlers
vi.mock('child_process', () => {
    const mockExec = vi.fn();
    return { exec: mockExec };
});
vi.mock('fs', () => ({ existsSync: vi.fn(() => true) }));

import * as cp from 'child_process';
import { handleKanbanMessage, triggerDependents } from '../commands/kanbanHandlers';
import type { KanbanHandlerContext } from '../commands/kanbanHandlers';
import { TaskStatus } from '../core/types';
import type { OrchestratorTask, KanbanSwimLane } from '../core/types';

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

// ─── generatePlan ─────────────────────────────────────────────────────────────

describe('generatePlan handler', () => {
    let ctx: KanbanHandlerContext;

    beforeEach(() => {
        vi.clearAllMocks();
        ctx = makeCtx();
    });

    it('spawns AI CLI and parses JSON task array', async () => {
        const mockTasks = [
            { title: 'Setup database', description: 'Create schema', role: 'coder', dependsOn: [] },
            { title: 'Build API', description: 'REST endpoints', role: 'coder', dependsOn: [0] },
        ];
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, JSON.stringify(mockTasks), '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generatePlan', {
            swimLaneId: '',
            text: 'Build a REST API',
            conversation: [],
        }, ctx);

        expect(ctx.kanbanView.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'generatePlanResult',
                tasks: expect.arrayContaining([
                    expect.objectContaining({ title: 'Setup database' }),
                    expect.objectContaining({ title: 'Build API', dependsOn: [0] }),
                ]),
            })
        );
    });

    it('validates dependsOn indices — filters self-refs and invalid refs', async () => {
        const mockTasks = [
            { title: 'Task A', description: '', role: '', dependsOn: [0, 5, -1] },
            { title: 'Task B', description: '', role: '', dependsOn: [0, 1] },
        ];
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, JSON.stringify(mockTasks), '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generatePlan', {
            swimLaneId: '',
            text: 'Test deps',
            conversation: [],
        }, ctx);

        const call = (ctx.kanbanView.sendMessage as any).mock.calls[0][0];
        expect(call.type).toBe('generatePlanResult');
        // Task 0: all deps invalid (0 self-ref, 5 out of range, -1 negative)
        expect(call.tasks[0].dependsOn).toEqual([]);
        // Task 1: dep on 0 is valid, dep on 1 is self-ref
        expect(call.tasks[1].dependsOn).toEqual([0]);
    });

    it('handles AI errors gracefully', async () => {
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(new Error('command not found'), '', 'command not found');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generatePlan', {
            swimLaneId: '',
            text: 'Something',
            conversation: [],
        }, ctx);

        expect(ctx.kanbanView.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'generatePlanResult',
                error: expect.stringContaining('AI command failed'),
            })
        );
    });

    it('handles malformed JSON from AI', async () => {
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, 'This is not JSON at all', '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generatePlan', {
            swimLaneId: '',
            text: 'Something',
            conversation: [],
        }, ctx);

        expect(ctx.kanbanView.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'generatePlanResult',
                error: expect.stringContaining('Failed to parse'),
            })
        );
    });

    it('strips code fences from AI response', async () => {
        const mockTasks = [{ title: 'Only task', description: 'desc', role: 'coder', dependsOn: [] }];
        const fenced = '```json\n' + JSON.stringify(mockTasks) + '\n```';
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, fenced, '');
            return { stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn(), writable: true }, killed: false };
        });

        await handleKanbanMessage('generatePlan', {
            swimLaneId: '',
            text: 'Simple task',
            conversation: [],
        }, ctx);

        const call = (ctx.kanbanView.sendMessage as any).mock.calls[0][0];
        expect(call.type).toBe('generatePlanResult');
        expect(call.tasks).toHaveLength(1);
        expect(call.tasks[0].title).toBe('Only task');
    });

    it('includes conversation history in prompt', async () => {
        const mockTasks = [{ title: 'Refined task', description: '', role: '', dependsOn: [] }];
        let capturedPrompt = '';
        (cp.exec as any).mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            const stdinWrite = vi.fn((data: string) => { capturedPrompt = data; });
            // Delay the callback to let process.nextTick fire the stdin.write first
            const proc = {
                stdin: {
                    on: vi.fn(),
                    write: stdinWrite,
                    end: vi.fn(),
                    writable: true,
                },
                killed: false,
            };
            // Schedule callback after nextTick so stdin.write captures the prompt
            setTimeout(() => cb(null, JSON.stringify(mockTasks), ''), 10);
            return proc;
        });

        await handleKanbanMessage('generatePlan', {
            swimLaneId: '',
            text: 'Refine it',
            conversation: [
                { role: 'user', text: 'Build API' },
                { role: 'assistant', text: '[{"title":"Task 1"}]' },
                { role: 'user', text: 'Refine it' },
            ],
        }, ctx);

        // The prompt should include conversation history
        expect(capturedPrompt).toContain('Conversation History');
        expect(capturedPrompt).toContain('Build API');
    });
});

// ─── approvePlan ──────────────────────────────────────────────────────────────

describe('approvePlan handler', () => {
    let ctx: KanbanHandlerContext;
    let lane: KanbanSwimLane;

    beforeEach(() => {
        vi.clearAllMocks();
        lane = makeLane('lane1', 'Dev Lane', {
            defaultToggles: { autoStart: true, autoPilot: true, autoClose: true },
        });
        ctx = makeCtx({ swimLanes: [lane] });
    });

    it('creates tasks with correct fields', async () => {
        await handleKanbanMessage('approvePlan', {
            swimLaneId: 'lane1',
            tasks: [
                { title: 'Task A', description: 'Do A', role: 'coder', dependsOn: [] },
                { title: 'Task B', description: 'Do B', role: 'tester', dependsOn: [0] },
            ],
        }, ctx);

        expect(ctx.orchestrator.submitTask).toHaveBeenCalledTimes(2);
        expect(ctx.database.saveTask).toHaveBeenCalled();

        const firstCall = (ctx.orchestrator.submitTask as any).mock.calls[0][0];
        expect(firstCall.description).toBe('Task A');
        expect(firstCall.input).toBe('Do A');
        expect(firstCall.targetRole).toBe('coder');
        expect(firstCall.kanbanColumn).toBe('todo');
        expect(firstCall.swimLaneId).toBe('lane1');
    });

    it('maps index-based deps to actual task IDs', async () => {
        await handleKanbanMessage('approvePlan', {
            swimLaneId: 'lane1',
            tasks: [
                { title: 'First', description: '', role: '', dependsOn: [] },
                { title: 'Second', description: '', role: '', dependsOn: [0] },
            ],
        }, ctx);

        const secondCall = (ctx.orchestrator.submitTask as any).mock.calls[1][0];
        expect(secondCall.dependsOn).toHaveLength(1);
        // dependsOn should contain the actual ID of the first task
        const firstCall = (ctx.orchestrator.submitTask as any).mock.calls[0][0];
        expect(secondCall.dependsOn[0]).toBe(firstCall.id);
    });

    it('starts Wave 1 tasks with autoStart and no deps', async () => {
        await handleKanbanMessage('approvePlan', {
            swimLaneId: 'lane1',
            tasks: [
                { title: 'Wave 1 task', description: '', role: '', dependsOn: [] },
                { title: 'Wave 2 task', description: '', role: '', dependsOn: [0] },
            ],
        }, ctx);

        // Only the first task (no deps) should be started
        expect(ctx.startTaskFlow).toHaveBeenCalledTimes(1);
        const startedTask = (ctx.startTaskFlow as any).mock.calls[0][0];
        expect(startedTask.description).toBe('Wave 1 task');
    });

    it('sends success message on completion', async () => {
        await handleKanbanMessage('approvePlan', {
            swimLaneId: 'lane1',
            tasks: [
                { title: 'Only task', description: '', role: '', dependsOn: [] },
            ],
        }, ctx);

        expect(ctx.kanbanView.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'approvePlanResult', success: true })
        );
    });

    it('calls updateKanban after creating tasks', async () => {
        await handleKanbanMessage('approvePlan', {
            swimLaneId: 'lane1',
            tasks: [
                { title: 'Task', description: '', role: '', dependsOn: [] },
            ],
        }, ctx);

        expect(ctx.updateKanban).toHaveBeenCalled();
    });
});

// ─── triggerDependents integration ────────────────────────────────────────────

describe('triggerDependents with plan tasks', () => {
    it('starts dependent task when all deps complete', async () => {
        const lane = makeLane('lane1', 'Dev', {
            defaultToggles: { autoStart: true },
        });
        const tasks: OrchestratorTask[] = [];
        const ctx = makeCtx({
            swimLanes: [lane],
            orchestrator: {
                submitTask: vi.fn((t: OrchestratorTask) => { tasks.push(t); }),
                getTask: vi.fn((id: string) => tasks.find(t => t.id === id)),
                getTaskQueue: vi.fn(() => tasks),
            } as any,
        });

        // Simulate two tasks created by approvePlan
        const task1: OrchestratorTask = {
            id: 'plan-task-1',
            description: 'First task',
            status: TaskStatus.COMPLETED,
            priority: 5,
            kanbanColumn: 'done',
            swimLaneId: 'lane1',
            createdAt: Date.now(),
            autoStart: true,
        };
        const task2: OrchestratorTask = {
            id: 'plan-task-2',
            description: 'Second task',
            status: TaskStatus.PENDING,
            priority: 5,
            kanbanColumn: 'todo',
            swimLaneId: 'lane1',
            createdAt: Date.now(),
            dependsOn: ['plan-task-1'],
            autoStart: true,
        };
        tasks.push(task1, task2);

        await triggerDependents(ctx, 'plan-task-1');

        expect(ctx.startTaskFlow).toHaveBeenCalledTimes(1);
        expect(ctx.startTaskFlow).toHaveBeenCalledWith(task2);
    });

    it('does not start task when not all deps are complete', async () => {
        const lane = makeLane('lane1', 'Dev', {
            defaultToggles: { autoStart: true },
        });
        const tasks: OrchestratorTask[] = [];
        const ctx = makeCtx({
            swimLanes: [lane],
            orchestrator: {
                submitTask: vi.fn((t: OrchestratorTask) => { tasks.push(t); }),
                getTask: vi.fn((id: string) => tasks.find(t => t.id === id)),
                getTaskQueue: vi.fn(() => tasks),
            } as any,
        });

        const task1: OrchestratorTask = {
            id: 'plan-task-1',
            description: 'First',
            status: TaskStatus.COMPLETED,
            priority: 5,
            kanbanColumn: 'done',
            swimLaneId: 'lane1',
            createdAt: Date.now(),
        };
        const task2: OrchestratorTask = {
            id: 'plan-task-2',
            description: 'Second',
            status: TaskStatus.PENDING,
            priority: 5,
            kanbanColumn: 'todo',
            swimLaneId: 'lane1',
            createdAt: Date.now(),
        };
        const task3: OrchestratorTask = {
            id: 'plan-task-3',
            description: 'Third',
            status: TaskStatus.PENDING,
            priority: 5,
            kanbanColumn: 'todo',
            swimLaneId: 'lane1',
            createdAt: Date.now(),
            dependsOn: ['plan-task-1', 'plan-task-2'],
            autoStart: true,
        };
        tasks.push(task1, task2, task3);

        await triggerDependents(ctx, 'plan-task-1');

        // task3 still has task2 incomplete, so should not start
        expect(ctx.startTaskFlow).not.toHaveBeenCalled();
    });
});
