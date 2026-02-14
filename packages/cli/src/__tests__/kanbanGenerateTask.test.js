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
// ─── generateTask ─────────────────────────────────────────────────────────────
(0, vitest_1.describe)('generateTask handler', () => {
    let ctx;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        ctx = makeCtx();
    });
    (0, vitest_1.it)('spawns AI CLI and parses full JSON task object', async () => {
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
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generateTask', {
            text: 'add auth',
            swimLaneId: '',
        }, ctx);
        (0, vitest_1.expect)(ctx.kanbanView.sendMessage).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            type: 'generateTaskResult',
            task: vitest_1.expect.objectContaining({
                title: 'Add user authentication',
                description: vitest_1.expect.stringContaining('JWT'),
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
        }));
    });
    (0, vitest_1.it)('handles AI errors gracefully', async () => {
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(new Error('command not found'), '', 'command not found');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);
        (0, vitest_1.expect)(ctx.kanbanView.sendMessage).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            type: 'generateTaskResult',
            error: vitest_1.expect.stringContaining('AI command failed'),
        }));
    });
    (0, vitest_1.it)('handles malformed JSON from AI', async () => {
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, 'This is not JSON at all', '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);
        (0, vitest_1.expect)(ctx.kanbanView.sendMessage).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            type: 'generateTaskResult',
            error: vitest_1.expect.stringContaining('Failed to parse'),
        }));
    });
    (0, vitest_1.it)('strips code fences from AI response', async () => {
        const mockTask = { title: 'Fix login bug', description: 'desc', role: 'coder', priority: 8, tags: ['bug'], autoStart: true, autoPilot: false, autoClose: false, useWorktree: false, aiProvider: '', aiModel: '' };
        const fenced = '```json\n' + JSON.stringify(mockTask) + '\n```';
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, fenced, '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generateTask', {
            text: 'fix login',
            swimLaneId: '',
        }, ctx);
        const call = ctx.kanbanView.sendMessage.mock.calls[0][0];
        (0, vitest_1.expect)(call.type).toBe('generateTaskResult');
        (0, vitest_1.expect)(call.task.title).toBe('Fix login bug');
        (0, vitest_1.expect)(call.task.priority).toBe(8);
    });
    (0, vitest_1.it)('clamps priority to valid range (1-10)', async () => {
        const mockTask = { title: 'Task', description: 'desc', role: 'coder', priority: 15, tags: [] };
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);
        const call = ctx.kanbanView.sendMessage.mock.calls[0][0];
        (0, vitest_1.expect)(call.task.priority).toBe(10);
    });
    (0, vitest_1.it)('validates role against allowed list', async () => {
        const mockTask = { title: 'Task', description: 'desc', role: 'hacker', priority: 5, tags: [] };
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);
        const call = ctx.kanbanView.sendMessage.mock.calls[0][0];
        (0, vitest_1.expect)(call.task.role).toBe('');
    });
    (0, vitest_1.it)('truncates title to 60 characters', async () => {
        const longTitle = 'A'.repeat(100);
        const mockTask = { title: longTitle, description: 'desc', role: 'coder', priority: 5, tags: [] };
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);
        const call = ctx.kanbanView.sendMessage.mock.calls[0][0];
        (0, vitest_1.expect)(call.task.title).toHaveLength(60);
    });
    (0, vitest_1.it)('limits tags to 5', async () => {
        const mockTask = { title: 'Task', description: 'desc', role: '', priority: 5, tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] };
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);
        const call = ctx.kanbanView.sendMessage.mock.calls[0][0];
        (0, vitest_1.expect)(call.task.tags).toHaveLength(5);
    });
    (0, vitest_1.it)('validates aiProvider against allowed list', async () => {
        const mockTask = { title: 'Task', description: 'desc', role: '', priority: 5, tags: [], aiProvider: 'invalid-provider', aiModel: 'gpt-5' };
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);
        const call = ctx.kanbanView.sendMessage.mock.calls[0][0];
        (0, vitest_1.expect)(call.task.aiProvider).toBe('');
        (0, vitest_1.expect)(call.task.aiModel).toBe('gpt-5');
    });
    (0, vitest_1.it)('accepts valid aiProvider', async () => {
        const mockTask = { title: 'Task', description: 'desc', role: '', priority: 5, tags: [], aiProvider: 'gemini', aiModel: 'gemini-2.5-pro' };
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);
        const call = ctx.kanbanView.sendMessage.mock.calls[0][0];
        (0, vitest_1.expect)(call.task.aiProvider).toBe('gemini');
        (0, vitest_1.expect)(call.task.aiModel).toBe('gemini-2.5-pro');
    });
    (0, vitest_1.it)('includes toggle values in response', async () => {
        const mockTask = {
            title: 'Risky refactor', description: 'desc', role: 'coder', priority: 6, tags: ['refactor'],
            autoStart: true, autoPilot: false, autoClose: false, useWorktree: true,
            aiProvider: '', aiModel: ''
        };
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generateTask', {
            text: 'risky refactor of auth module',
            swimLaneId: '',
        }, ctx);
        const call = ctx.kanbanView.sendMessage.mock.calls[0][0];
        (0, vitest_1.expect)(call.task.autoStart).toBe(true);
        (0, vitest_1.expect)(call.task.autoPilot).toBe(false);
        (0, vitest_1.expect)(call.task.autoClose).toBe(false);
        (0, vitest_1.expect)(call.task.useWorktree).toBe(true);
    });
    (0, vitest_1.it)('includes swim lane context with toggles in prompt', async () => {
        const lane = makeLane('lane1', 'Auth Project', {
            contextInstructions: 'Use TypeScript and Express',
            aiProvider: 'claude',
            aiModel: 'opus',
            defaultToggles: { autoStart: true, autoPilot: true, autoClose: false, useWorktree: false },
        });
        ctx = makeCtx({ swimLanes: [lane] });
        let capturedPrompt = '';
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            const stdinWrite = vitest_1.vi.fn((data) => { capturedPrompt = data; });
            const proc = {
                stdin: { on: vitest_1.vi.fn(), write: stdinWrite, end: vitest_1.vi.fn(), writable: true },
                killed: false,
            };
            setTimeout(() => cb(null, JSON.stringify({ title: 'T', description: 'd', role: '', priority: 5, tags: [] }), ''), 10);
            return proc;
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generateTask', {
            text: 'add login page',
            swimLaneId: 'lane1',
        }, ctx);
        (0, vitest_1.expect)(capturedPrompt).toContain('Auth Project');
        (0, vitest_1.expect)(capturedPrompt).toContain('Use TypeScript and Express');
        (0, vitest_1.expect)(capturedPrompt).toContain('autoStart=on');
        (0, vitest_1.expect)(capturedPrompt).toContain('autoPilot=on');
        (0, vitest_1.expect)(capturedPrompt).toContain('Lane default AI provider: claude');
    });
    (0, vitest_1.it)('does nothing when text is empty', async () => {
        await (0, kanbanHandlers_1.handleKanbanMessage)('generateTask', {
            text: '',
            swimLaneId: '',
        }, ctx);
        (0, vitest_1.expect)(cp.exec).not.toHaveBeenCalled();
        (0, vitest_1.expect)(ctx.kanbanView.sendMessage).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('treats non-boolean toggle values as undefined', async () => {
        const mockTask = {
            title: 'Task', description: 'desc', role: '', priority: 5, tags: [],
            autoStart: 'yes', autoPilot: 1, autoClose: null, useWorktree: undefined,
            aiProvider: '', aiModel: ''
        };
        cp.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, JSON.stringify(mockTask), '');
            return { stdin: { on: vitest_1.vi.fn(), write: vitest_1.vi.fn(), end: vitest_1.vi.fn(), writable: true }, killed: false };
        });
        await (0, kanbanHandlers_1.handleKanbanMessage)('generateTask', {
            text: 'some task',
            swimLaneId: '',
        }, ctx);
        const call = ctx.kanbanView.sendMessage.mock.calls[0][0];
        // Non-boolean values should be treated as undefined (not set)
        (0, vitest_1.expect)(call.task.autoStart).toBeUndefined();
        (0, vitest_1.expect)(call.task.autoPilot).toBeUndefined();
        (0, vitest_1.expect)(call.task.autoClose).toBeUndefined();
        (0, vitest_1.expect)(call.task.useWorktree).toBeUndefined();
    });
});
//# sourceMappingURL=kanbanGenerateTask.test.js.map