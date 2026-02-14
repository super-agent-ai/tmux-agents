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
// Mock child_process before importing handlers
vitest_1.vi.mock('child_process', () => {
    const mockExec = vitest_1.vi.fn();
    return { exec: mockExec };
});
vitest_1.vi.mock('fs', () => ({ existsSync: vitest_1.vi.fn(() => true) }));
const cp = __importStar(require("child_process"));
const kanbanHandlers_1 = require("../commands/kanbanHandlers");
const types_1 = require("../core/types");
// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeCtx(overrides = {}) {
    const tasks = [];
    return {
        serviceManager: {},
        tmuxSessionProvider: {},
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
        },
        swimLanes: [],
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
const makeLane = (id, name, overrides = {}) => ({
    id,
    name,
    serverId: 'local',
    workingDirectory: '~/project',
    sessionName: `session-${id}`,
    createdAt: Date.now(),
    ...overrides,
});
// ─── generatePlan ─────────────────────────────────────────────────────────────
(0, vitest_1.describe)('generatePlan handler', () => {
    let ctx;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        ctx = makeCtx();
    });
    (0, vitest_1.it)('spawns AI CLI and parses JSON task array', async () => {
        const mockTasks = [
            { title: 'Setup database', description: 'Create schema', role: 'coder', dependsOn: [] },
            { title: 'Build API', description: 'REST endpoints', role: 'coder', dependsOn: [0] },
        ];
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, JSON.stringify(mockTasks), '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generatePlan', {
            swimLaneId: '',
            text: 'Build a REST API',
            conversation: [],
        }, ctx);
        (0, vitest_1.expect)(ctx.kanbanView.sendMessage).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            type: 'generatePlanResult',
            tasks: vitest_1.expect.arrayContaining([
                vitest_1.expect.objectContaining({ title: 'Setup database' }),
                vitest_1.expect.objectContaining({ title: 'Build API', dependsOn: [0] }),
            ]),
        }));
    });
    (0, vitest_1.it)('validates dependsOn indices — filters self-refs and invalid refs', async () => {
        const mockTasks = [
            { title: 'Task A', description: '', role: '', dependsOn: [0, 5, -1] },
            { title: 'Task B', description: '', role: '', dependsOn: [0, 1] },
        ];
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, JSON.stringify(mockTasks), '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generatePlan', {
            swimLaneId: '',
            text: 'Test deps',
            conversation: [],
        }, ctx);
        const call = ctx.kanbanView.sendMessage.mock.calls[0][0];
        (0, vitest_1.expect)(call.type).toBe('generatePlanResult');
        // Task 0: all deps invalid (0 self-ref, 5 out of range, -1 negative)
        (0, vitest_1.expect)(call.tasks[0].dependsOn).toEqual([]);
        // Task 1: dep on 0 is valid, dep on 1 is self-ref
        (0, vitest_1.expect)(call.tasks[1].dependsOn).toEqual([0]);
    });
    (0, vitest_1.it)('handles AI errors gracefully', async () => {
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(new Error('command not found'), '', 'command not found');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generatePlan', {
            swimLaneId: '',
            text: 'Something',
            conversation: [],
        }, ctx);
        (0, vitest_1.expect)(ctx.kanbanView.sendMessage).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            type: 'generatePlanResult',
            error: vitest_1.expect.stringContaining('AI command failed'),
        }));
    });
    (0, vitest_1.it)('handles malformed JSON from AI', async () => {
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, 'This is not JSON at all', '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generatePlan', {
            swimLaneId: '',
            text: 'Something',
            conversation: [],
        }, ctx);
        (0, vitest_1.expect)(ctx.kanbanView.sendMessage).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            type: 'generatePlanResult',
            error: vitest_1.expect.stringContaining('Failed to parse'),
        }));
    });
    (0, vitest_1.it)('strips code fences from AI response', async () => {
        const mockTasks = [{ title: 'Only task', description: 'desc', role: 'coder', dependsOn: [] }];
        const fenced = '```json\n' + JSON.stringify(mockTasks) + '\n```';
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, fenced, '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generatePlan', {
            swimLaneId: '',
            text: 'Simple task',
            conversation: [],
        }, ctx);
        const call = ctx.kanbanView.sendMessage.mock.calls[0][0];
        (0, vitest_1.expect)(call.type).toBe('generatePlanResult');
        (0, vitest_1.expect)(call.tasks).toHaveLength(1);
        (0, vitest_1.expect)(call.tasks[0].title).toBe('Only task');
    });
    (0, vitest_1.it)('includes conversation history in prompt', async () => {
        const mockTasks = [{ title: 'Refined task', description: '', role: '', dependsOn: [] }];
        let capturedPrompt = '';
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            const stdinWrite = vitest_1.vi.fn((data) => { capturedPrompt = data; });
            // Delay the callback to let process.nextTick fire the stdin.write first
            const proc = {
                stdin: {
                    on: vitest_1.vi.fn(),
                    write: stdinWrite,
                    end: vitest_1.vi.fn(),
                    writable: true,
                },
                killed: false,
            };
            // Schedule callback after nextTick so stdin.write captures the prompt
            setTimeout(() => cb(null, JSON.stringify(mockTasks), ''), 10);
            return proc;
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generatePlan', {
            swimLaneId: '',
            text: 'Refine it',
            conversation: [
                { role: 'user', text: 'Build API' },
                { role: 'assistant', text: '[{"title":"Task 1"}]' },
                { role: 'user', text: 'Refine it' },
            ],
        }, ctx);
        // The prompt should include conversation history
        (0, vitest_1.expect)(capturedPrompt).toContain('Conversation History');
        (0, vitest_1.expect)(capturedPrompt).toContain('Build API');
    });
});
// ─── approvePlan ──────────────────────────────────────────────────────────────
(0, vitest_1.describe)('approvePlan handler', () => {
    let ctx;
    let lane;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        lane = makeLane('lane1', 'Dev Lane', {
            defaultToggles: { autoStart: true, autoPilot: true, autoClose: true },
        });
        ctx = makeCtx({ swimLanes: [lane] });
    });
    (0, vitest_1.it)('creates tasks with correct fields', async () => {
        await (0, kanbanHandlers_1.handleKanbanMessage)('approvePlan', {
            swimLaneId: 'lane1',
            tasks: [
                { title: 'Task A', description: 'Do A', role: 'coder', dependsOn: [] },
                { title: 'Task B', description: 'Do B', role: 'tester', dependsOn: [0] },
            ],
        }, ctx);
        (0, vitest_1.expect)(ctx.orchestrator.submitTask).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(ctx.database.saveTask).toHaveBeenCalled();
        const firstCall = ctx.orchestrator.submitTask.mock.calls[0][0];
        (0, vitest_1.expect)(firstCall.description).toBe('Task A');
        (0, vitest_1.expect)(firstCall.input).toBe('Do A');
        (0, vitest_1.expect)(firstCall.targetRole).toBe('coder');
        (0, vitest_1.expect)(firstCall.kanbanColumn).toBe('todo');
        (0, vitest_1.expect)(firstCall.swimLaneId).toBe('lane1');
    });
    (0, vitest_1.it)('maps index-based deps to actual task IDs', async () => {
        await (0, kanbanHandlers_1.handleKanbanMessage)('approvePlan', {
            swimLaneId: 'lane1',
            tasks: [
                { title: 'First', description: '', role: '', dependsOn: [] },
                { title: 'Second', description: '', role: '', dependsOn: [0] },
            ],
        }, ctx);
        const secondCall = ctx.orchestrator.submitTask.mock.calls[1][0];
        (0, vitest_1.expect)(secondCall.dependsOn).toHaveLength(1);
        // dependsOn should contain the actual ID of the first task
        const firstCall = ctx.orchestrator.submitTask.mock.calls[0][0];
        (0, vitest_1.expect)(secondCall.dependsOn[0]).toBe(firstCall.id);
    });
    (0, vitest_1.it)('starts Wave 1 tasks with autoStart and no deps', async () => {
        await (0, kanbanHandlers_1.handleKanbanMessage)('approvePlan', {
            swimLaneId: 'lane1',
            tasks: [
                { title: 'Wave 1 task', description: '', role: '', dependsOn: [] },
                { title: 'Wave 2 task', description: '', role: '', dependsOn: [0] },
            ],
        }, ctx);
        // Only the first task (no deps) should be started
        (0, vitest_1.expect)(ctx.startTaskFlow).toHaveBeenCalledTimes(1);
        const startedTask = ctx.startTaskFlow.mock.calls[0][0];
        (0, vitest_1.expect)(startedTask.description).toBe('Wave 1 task');
    });
    (0, vitest_1.it)('sends success message on completion', async () => {
        await (0, kanbanHandlers_1.handleKanbanMessage)('approvePlan', {
            swimLaneId: 'lane1',
            tasks: [
                { title: 'Only task', description: '', role: '', dependsOn: [] },
            ],
        }, ctx);
        (0, vitest_1.expect)(ctx.kanbanView.sendMessage).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ type: 'approvePlanResult', success: true }));
    });
    (0, vitest_1.it)('calls updateKanban after creating tasks', async () => {
        await (0, kanbanHandlers_1.handleKanbanMessage)('approvePlan', {
            swimLaneId: 'lane1',
            tasks: [
                { title: 'Task', description: '', role: '', dependsOn: [] },
            ],
        }, ctx);
        (0, vitest_1.expect)(ctx.updateKanban).toHaveBeenCalled();
    });
});
// ─── triggerDependents integration ────────────────────────────────────────────
(0, vitest_1.describe)('triggerDependents with plan tasks', () => {
    (0, vitest_1.it)('starts dependent task when all deps complete', async () => {
        const lane = makeLane('lane1', 'Dev', {
            defaultToggles: { autoStart: true },
        });
        const tasks = [];
        const ctx = makeCtx({
            swimLanes: [lane],
            orchestrator: {
                submitTask: vitest_1.vi.fn((t) => { tasks.push(t); }),
                getTask: vitest_1.vi.fn((id) => tasks.find(t => t.id === id)),
                getTaskQueue: vitest_1.vi.fn(() => tasks),
            },
        });
        // Simulate two tasks created by approvePlan
        const task1 = {
            id: 'plan-task-1',
            description: 'First task',
            status: types_1.TaskStatus.COMPLETED,
            priority: 5,
            kanbanColumn: 'done',
            swimLaneId: 'lane1',
            createdAt: Date.now(),
            autoStart: true,
        };
        const task2 = {
            id: 'plan-task-2',
            description: 'Second task',
            status: types_1.TaskStatus.PENDING,
            priority: 5,
            kanbanColumn: 'todo',
            swimLaneId: 'lane1',
            createdAt: Date.now(),
            dependsOn: ['plan-task-1'],
            autoStart: true,
        };
        tasks.push(task1, task2);
        await (0, kanbanHandlers_1.triggerDependents)(ctx, 'plan-task-1');
        (0, vitest_1.expect)(ctx.startTaskFlow).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(ctx.startTaskFlow).toHaveBeenCalledWith(task2);
    });
    (0, vitest_1.it)('does not start task when not all deps are complete', async () => {
        const lane = makeLane('lane1', 'Dev', {
            defaultToggles: { autoStart: true },
        });
        const tasks = [];
        const ctx = makeCtx({
            swimLanes: [lane],
            orchestrator: {
                submitTask: vitest_1.vi.fn((t) => { tasks.push(t); }),
                getTask: vitest_1.vi.fn((id) => tasks.find(t => t.id === id)),
                getTaskQueue: vitest_1.vi.fn(() => tasks),
            },
        });
        const task1 = {
            id: 'plan-task-1',
            description: 'First',
            status: types_1.TaskStatus.COMPLETED,
            priority: 5,
            kanbanColumn: 'done',
            swimLaneId: 'lane1',
            createdAt: Date.now(),
        };
        const task2 = {
            id: 'plan-task-2',
            description: 'Second',
            status: types_1.TaskStatus.PENDING,
            priority: 5,
            kanbanColumn: 'todo',
            swimLaneId: 'lane1',
            createdAt: Date.now(),
        };
        const task3 = {
            id: 'plan-task-3',
            description: 'Third',
            status: types_1.TaskStatus.PENDING,
            priority: 5,
            kanbanColumn: 'todo',
            swimLaneId: 'lane1',
            createdAt: Date.now(),
            dependsOn: ['plan-task-1', 'plan-task-2'],
            autoStart: true,
        };
        tasks.push(task1, task2, task3);
        await (0, kanbanHandlers_1.triggerDependents)(ctx, 'plan-task-1');
        // task3 still has task2 incomplete, so should not start
        (0, vitest_1.expect)(ctx.startTaskFlow).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=kanbanPlanHandlers.test.js.map