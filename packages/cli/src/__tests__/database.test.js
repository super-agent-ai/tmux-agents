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
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const actualPath = __importStar(require("path"));
const types_1 = require("../core/types");
// The Database class does `require(path.join(__dirname, 'sql-wasm.js'))`.
// In test context __dirname is the src/ dir, not out/ where compiled files live.
// We mock the 'path' module to redirect sql-wasm lookups to node_modules.
vitest_1.vi.mock('path', async () => {
    const actual = await vitest_1.vi.importActual('path');
    return {
        ...actual,
        default: {
            ...actual,
            join: (...args) => {
                const result = actual.join(...args);
                if (result.endsWith('sql-wasm.js')) {
                    return actual.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.js');
                }
                if (result.endsWith('sql-wasm.wasm')) {
                    return actual.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
                }
                return result;
            },
            dirname: actual.dirname,
        },
        join: (...args) => {
            const result = actual.join(...args);
            if (result.endsWith('sql-wasm.js')) {
                return actual.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.js');
            }
            if (result.endsWith('sql-wasm.wasm')) {
                return actual.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
            }
            return result;
        },
    };
});
const database_1 = require("../core/database");
// Use actual path.join for test setup (not the mocked one)
const realJoin = actualPath.join;
(0, vitest_1.describe)('Database', () => {
    let db;
    let dbPath;
    (0, vitest_1.beforeEach)(async () => {
        dbPath = realJoin(os.tmpdir(), `test-db-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
        db = new database_1.Database(dbPath);
        await db.initialize();
    });
    (0, vitest_1.afterEach)(() => {
        db.close();
        try {
            fs.unlinkSync(dbPath);
        }
        catch { }
    });
    // ─── Initialization ──────────────────────────────────────────────────
    (0, vitest_1.describe)('initialize', () => {
        (0, vitest_1.it)('creates database and tables', () => {
            (0, vitest_1.expect)(db.getAllTasks()).toEqual([]);
            (0, vitest_1.expect)(db.getAllAgents()).toEqual([]);
            (0, vitest_1.expect)(db.getAllSwimLanes()).toEqual([]);
        });
    });
    // ─── Tasks ───────────────────────────────────────────────────────────
    (0, vitest_1.describe)('tasks', () => {
        const makeTask = (id, overrides = {}) => ({
            id,
            description: `Task ${id}`,
            status: types_1.TaskStatus.PENDING,
            priority: 5,
            createdAt: Date.now(),
            verificationStatus: 'none',
            ...overrides,
        });
        (0, vitest_1.it)('saves and retrieves a task', () => {
            const task = makeTask('t1');
            db.saveTask(task);
            const loaded = db.getTask('t1');
            (0, vitest_1.expect)(loaded).toBeDefined();
            (0, vitest_1.expect)(loaded.id).toBe('t1');
            (0, vitest_1.expect)(loaded.description).toBe('Task t1');
            (0, vitest_1.expect)(loaded.status).toBe(types_1.TaskStatus.PENDING);
        });
        (0, vitest_1.it)('updates an existing task', () => {
            const task = makeTask('t2');
            db.saveTask(task);
            task.status = types_1.TaskStatus.COMPLETED;
            task.completedAt = Date.now();
            db.saveTask(task);
            const loaded = db.getTask('t2');
            (0, vitest_1.expect)(loaded.status).toBe(types_1.TaskStatus.COMPLETED);
            (0, vitest_1.expect)(loaded.completedAt).toBeDefined();
        });
        (0, vitest_1.it)('deletes a task', () => {
            db.saveTask(makeTask('t3'));
            db.deleteTask('t3');
            (0, vitest_1.expect)(db.getTask('t3')).toBeUndefined();
        });
        (0, vitest_1.it)('retrieves all tasks', () => {
            db.saveTask(makeTask('t4'));
            db.saveTask(makeTask('t5'));
            const all = db.getAllTasks();
            (0, vitest_1.expect)(all).toHaveLength(2);
        });
        (0, vitest_1.it)('saves and retrieves task with optional fields', () => {
            // Create referenced swim lane first (FK constraint)
            const lane = {
                id: 'lane-1', name: 'Test Lane', serverId: 'local',
                workingDirectory: '/tmp', sessionName: 'test',
                createdAt: Date.now(),
            };
            db.saveSwimLane(lane);
            const task = makeTask('t6', {
                targetRole: types_1.AgentRole.CODER,
                swimLaneId: 'lane-1',
                kanbanColumn: 'todo',
                tmuxSessionName: 'sess',
                tmuxWindowIndex: '0',
                tmuxPaneIndex: '0',
                tmuxServerId: 'local',
                autoStart: true,
                autoPilot: true,
                autoClose: false,
            });
            db.saveTask(task);
            const loaded = db.getTask('t6');
            (0, vitest_1.expect)(loaded.targetRole).toBe(types_1.AgentRole.CODER);
            (0, vitest_1.expect)(loaded.swimLaneId).toBe('lane-1');
            (0, vitest_1.expect)(loaded.autoStart).toBe(true);
            (0, vitest_1.expect)(loaded.autoPilot).toBe(true);
            (0, vitest_1.expect)(loaded.autoClose).toBe(false);
        });
        (0, vitest_1.it)('saves and retrieves useWorktree and worktreePath fields', () => {
            const task = makeTask('t-wt', {
                useWorktree: true,
                worktreePath: '/tmp/.worktrees/task-abc123',
            });
            db.saveTask(task);
            const loaded = db.getTask('t-wt');
            (0, vitest_1.expect)(loaded.useWorktree).toBe(true);
            (0, vitest_1.expect)(loaded.worktreePath).toBe('/tmp/.worktrees/task-abc123');
        });
        (0, vitest_1.it)('saves useWorktree as false when not set', () => {
            const task = makeTask('t-wt2');
            db.saveTask(task);
            const loaded = db.getTask('t-wt2');
            (0, vitest_1.expect)(loaded.useWorktree).toBeFalsy();
            (0, vitest_1.expect)(loaded.worktreePath).toBeUndefined();
        });
        (0, vitest_1.it)('saves and retrieves subtask relations', () => {
            // Save parent first (without subtaskIds) so FK on parentTaskId works
            const parent = makeTask('parent');
            db.saveTask(parent);
            const child1 = makeTask('child1', { parentTaskId: 'parent' });
            const child2 = makeTask('child2', { parentTaskId: 'parent' });
            db.saveTask(child1);
            db.saveTask(child2);
            // Now update parent with subtaskIds
            parent.subtaskIds = ['child1', 'child2'];
            db.saveTask(parent);
            const loaded = db.getTask('parent');
            (0, vitest_1.expect)(loaded.subtaskIds).toBeDefined();
            (0, vitest_1.expect)(loaded.subtaskIds.sort()).toEqual(['child1', 'child2']);
        });
        (0, vitest_1.it)('retrieves tasks by swim lane', () => {
            // Create referenced swim lanes first (FK constraint)
            db.saveSwimLane({ id: 'lane-a', name: 'A', serverId: 'local', workingDirectory: '/tmp', sessionName: 'a', createdAt: Date.now() });
            db.saveSwimLane({ id: 'lane-b', name: 'B', serverId: 'local', workingDirectory: '/tmp', sessionName: 'b', createdAt: Date.now() });
            db.saveTask(makeTask('s1', { swimLaneId: 'lane-a' }));
            db.saveTask(makeTask('s2', { swimLaneId: 'lane-a' }));
            db.saveTask(makeTask('s3', { swimLaneId: 'lane-b' }));
            const laneTasks = db.getTasksBySwimLane('lane-a');
            (0, vitest_1.expect)(laneTasks).toHaveLength(2);
        });
    });
    // ─── Swim Lanes ──────────────────────────────────────────────────────
    (0, vitest_1.describe)('swim lanes', () => {
        (0, vitest_1.it)('saves and retrieves a swim lane', () => {
            const lane = {
                id: 'sl1', name: 'Frontend', serverId: 'local',
                workingDirectory: '/project', sessionName: 'frontend',
                createdAt: Date.now(), sessionActive: true,
            };
            db.saveSwimLane(lane);
            const loaded = db.getSwimLane('sl1');
            (0, vitest_1.expect)(loaded).toBeDefined();
            (0, vitest_1.expect)(loaded.name).toBe('Frontend');
            (0, vitest_1.expect)(loaded.sessionActive).toBe(true);
        });
        (0, vitest_1.it)('deletes a swim lane', () => {
            const lane = {
                id: 'sl2', name: 'Backend', serverId: 'local',
                workingDirectory: '/project', sessionName: 'backend',
                createdAt: Date.now(),
            };
            db.saveSwimLane(lane);
            db.deleteSwimLane('sl2');
            (0, vitest_1.expect)(db.getSwimLane('sl2')).toBeUndefined();
        });
        (0, vitest_1.it)('saves and retrieves defaultToggles', () => {
            const lane = {
                id: 'sl-dt', name: 'WithDefaults', serverId: 'local',
                workingDirectory: '/project', sessionName: 'defaults',
                createdAt: Date.now(),
                defaultToggles: { autoStart: true, autoPilot: false, autoClose: true, useWorktree: false },
            };
            db.saveSwimLane(lane);
            const loaded = db.getSwimLane('sl-dt');
            (0, vitest_1.expect)(loaded).toBeDefined();
            (0, vitest_1.expect)(loaded.defaultToggles).toEqual({ autoStart: true, autoPilot: false, autoClose: true, useWorktree: false });
        });
        (0, vitest_1.it)('returns undefined defaultToggles for lanes without them', () => {
            const lane = {
                id: 'sl-nodt', name: 'NoDefaults', serverId: 'local',
                workingDirectory: '/project', sessionName: 'nodefaults',
                createdAt: Date.now(),
            };
            db.saveSwimLane(lane);
            const loaded = db.getSwimLane('sl-nodt');
            (0, vitest_1.expect)(loaded).toBeDefined();
            (0, vitest_1.expect)(loaded.defaultToggles).toBeUndefined();
        });
        (0, vitest_1.it)('updates defaultToggles when lane is re-saved', () => {
            const lane = {
                id: 'sl-updt', name: 'Update', serverId: 'local',
                workingDirectory: '/project', sessionName: 'update',
                createdAt: Date.now(),
                defaultToggles: { autoStart: true, autoPilot: true, autoClose: false, useWorktree: false },
            };
            db.saveSwimLane(lane);
            lane.defaultToggles = { autoStart: false, autoPilot: false, autoClose: true, useWorktree: true };
            db.saveSwimLane(lane);
            const loaded = db.getSwimLane('sl-updt');
            (0, vitest_1.expect)(loaded.defaultToggles).toEqual({ autoStart: false, autoPilot: false, autoClose: true, useWorktree: true });
        });
    });
    // ─── Agents ──────────────────────────────────────────────────────────
    (0, vitest_1.describe)('agents', () => {
        const makeAgent = (id) => ({
            id, templateId: 'tmpl-1', name: `Agent ${id}`,
            role: types_1.AgentRole.CODER, aiProvider: types_1.AIProvider.CLAUDE,
            state: types_1.AgentState.IDLE, serverId: 'local',
            sessionName: 'sess', windowIndex: '0', paneIndex: '0',
            createdAt: Date.now(), lastActivityAt: Date.now(),
        });
        (0, vitest_1.it)('saves and retrieves an agent', () => {
            db.saveAgent(makeAgent('a1'));
            const loaded = db.getAgent('a1');
            (0, vitest_1.expect)(loaded).toBeDefined();
            (0, vitest_1.expect)(loaded.name).toBe('Agent a1');
            (0, vitest_1.expect)(loaded.role).toBe(types_1.AgentRole.CODER);
        });
        (0, vitest_1.it)('deletes an agent', () => {
            db.saveAgent(makeAgent('a2'));
            db.deleteAgent('a2');
            (0, vitest_1.expect)(db.getAgent('a2')).toBeUndefined();
        });
    });
    // ─── Teams ───────────────────────────────────────────────────────────
    (0, vitest_1.describe)('teams', () => {
        (0, vitest_1.it)('saves and retrieves a team with agents', () => {
            // Create agents first (FK constraint on team_agents)
            const makeAgent = (id) => ({
                id, templateId: 'tmpl-1', name: `Agent ${id}`,
                role: types_1.AgentRole.CODER, aiProvider: types_1.AIProvider.CLAUDE,
                state: types_1.AgentState.IDLE, serverId: 'local',
                sessionName: 'sess', windowIndex: '0', paneIndex: '0',
                createdAt: Date.now(), lastActivityAt: Date.now(),
            });
            db.saveAgent(makeAgent('a1'));
            db.saveAgent(makeAgent('a2'));
            const team = {
                id: 'team1', name: 'Dev Team',
                agents: ['a1', 'a2'], createdAt: Date.now(),
            };
            db.saveTeam(team);
            const loaded = db.getTeam('team1');
            (0, vitest_1.expect)(loaded).toBeDefined();
            (0, vitest_1.expect)(loaded.name).toBe('Dev Team');
            (0, vitest_1.expect)(loaded.agents.sort()).toEqual(['a1', 'a2']);
        });
        (0, vitest_1.it)('deletes a team', () => {
            const team = {
                id: 'team2', name: 'QA Team',
                agents: [], createdAt: Date.now(),
            };
            db.saveTeam(team);
            db.deleteTeam('team2');
            (0, vitest_1.expect)(db.getTeam('team2')).toBeUndefined();
        });
    });
    // ─── Pipelines ───────────────────────────────────────────────────────
    (0, vitest_1.describe)('pipelines', () => {
        (0, vitest_1.it)('saves and retrieves a pipeline', () => {
            const pipeline = {
                id: 'p1', name: 'Build Pipeline',
                stages: [{ id: 's1', name: 'Build', type: 'sequential', agentRole: types_1.AgentRole.CODER, taskDescription: 'Build the app', dependsOn: [] }],
                createdAt: Date.now(), updatedAt: Date.now(),
            };
            db.savePipeline(pipeline);
            const loaded = db.getPipeline('p1');
            (0, vitest_1.expect)(loaded).toBeDefined();
            (0, vitest_1.expect)(loaded.stages).toHaveLength(1);
            (0, vitest_1.expect)(loaded.stages[0].name).toBe('Build');
        });
        (0, vitest_1.it)('deletes a pipeline', () => {
            const pipeline = {
                id: 'p2', name: 'Test Pipeline',
                stages: [], createdAt: Date.now(), updatedAt: Date.now(),
            };
            db.savePipeline(pipeline);
            db.deletePipeline('p2');
            (0, vitest_1.expect)(db.getPipeline('p2')).toBeUndefined();
        });
    });
    // ─── Pipeline Runs ───────────────────────────────────────────────────
    (0, vitest_1.describe)('pipeline runs', () => {
        (0, vitest_1.it)('saves and retrieves a pipeline run', () => {
            // Create referenced pipeline first (FK constraint)
            const pipeline = {
                id: 'p1', name: 'Test',
                stages: [], createdAt: Date.now(), updatedAt: Date.now(),
            };
            db.savePipeline(pipeline);
            const run = {
                id: 'r1', pipelineId: 'p1',
                status: types_1.PipelineStatus.RUNNING,
                stageResults: { s1: { status: types_1.TaskStatus.COMPLETED } },
                startedAt: Date.now(),
            };
            db.savePipelineRun(run);
            const loaded = db.getPipelineRun('r1');
            (0, vitest_1.expect)(loaded).toBeDefined();
            (0, vitest_1.expect)(loaded.status).toBe(types_1.PipelineStatus.RUNNING);
            (0, vitest_1.expect)(loaded.stageResults.s1.status).toBe(types_1.TaskStatus.COMPLETED);
        });
        (0, vitest_1.it)('deletes a pipeline run', () => {
            // Create referenced pipeline first (FK constraint)
            const pipeline = {
                id: 'p1-del', name: 'Test',
                stages: [], createdAt: Date.now(), updatedAt: Date.now(),
            };
            db.savePipeline(pipeline);
            const run = {
                id: 'r2', pipelineId: 'p1-del',
                status: types_1.PipelineStatus.DRAFT,
                stageResults: {}, startedAt: Date.now(),
            };
            db.savePipelineRun(run);
            db.deletePipelineRun('r2');
            (0, vitest_1.expect)(db.getPipelineRun('r2')).toBeUndefined();
        });
    });
    // ─── Task Comments ──────────────────────────────────────────────────
    (0, vitest_1.describe)('task comments', () => {
        const makeTask = (id, overrides = {}) => ({
            id,
            description: `Task ${id}`,
            status: types_1.TaskStatus.PENDING,
            priority: 5,
            createdAt: Date.now(),
            verificationStatus: 'none',
            ...overrides,
        });
        (0, vitest_1.it)('adds and retrieves comments', () => {
            db.saveTask(makeTask('ct1'));
            const c1 = { id: 'c1', taskId: 'ct1', text: 'First comment', createdAt: 1000 };
            const c2 = { id: 'c2', taskId: 'ct1', text: 'Second comment', createdAt: 2000 };
            db.addComment(c1);
            db.addComment(c2);
            const comments = db.getComments('ct1');
            (0, vitest_1.expect)(comments).toHaveLength(2);
            (0, vitest_1.expect)(comments[0].text).toBe('First comment');
            (0, vitest_1.expect)(comments[1].text).toBe('Second comment');
        });
        (0, vitest_1.it)('deletes a comment', () => {
            db.saveTask(makeTask('ct2'));
            db.addComment({ id: 'c3', taskId: 'ct2', text: 'To delete', createdAt: 1000 });
            db.deleteComment('c3');
            (0, vitest_1.expect)(db.getComments('ct2')).toHaveLength(0);
        });
        (0, vitest_1.it)('cascades comments on task delete', () => {
            db.saveTask(makeTask('ct3'));
            db.addComment({ id: 'c4', taskId: 'ct3', text: 'Will cascade', createdAt: 1000 });
            db.deleteTask('ct3');
            (0, vitest_1.expect)(db.getComments('ct3')).toHaveLength(0);
        });
    });
    // ─── Task Tags ──────────────────────────────────────────────────────
    (0, vitest_1.describe)('task tags', () => {
        const makeTask = (id, overrides = {}) => ({
            id,
            description: `Task ${id}`,
            status: types_1.TaskStatus.PENDING,
            priority: 5,
            createdAt: Date.now(),
            verificationStatus: 'none',
            ...overrides,
        });
        (0, vitest_1.it)('saves and retrieves tags', () => {
            db.saveTask(makeTask('tt1'));
            db.saveTags('tt1', ['bug', 'urgent']);
            const tags = db.getTags('tt1');
            (0, vitest_1.expect)(tags.sort()).toEqual(['bug', 'urgent']);
        });
        (0, vitest_1.it)('replaces tags on re-save', () => {
            db.saveTask(makeTask('tt2'));
            db.saveTags('tt2', ['feature', 'docs']);
            db.saveTags('tt2', ['refactor']);
            const tags = db.getTags('tt2');
            (0, vitest_1.expect)(tags).toEqual(['refactor']);
        });
        (0, vitest_1.it)('cascades tags on task delete', () => {
            db.saveTask(makeTask('tt3'));
            db.saveTags('tt3', ['test']);
            db.deleteTask('tt3');
            (0, vitest_1.expect)(db.getTags('tt3')).toHaveLength(0);
        });
    });
    // ─── Task Status History ────────────────────────────────────────────
    (0, vitest_1.describe)('task status history', () => {
        const makeTask = (id, overrides = {}) => ({
            id,
            description: `Task ${id}`,
            status: types_1.TaskStatus.PENDING,
            priority: 5,
            createdAt: Date.now(),
            verificationStatus: 'none',
            ...overrides,
        });
        (0, vitest_1.it)('adds and retrieves status history', () => {
            db.saveTask(makeTask('sh1'));
            const entry = {
                id: 'h1', taskId: 'sh1',
                fromStatus: 'pending', toStatus: 'in_progress',
                fromColumn: 'todo', toColumn: 'in_progress',
                changedAt: 1000
            };
            db.addStatusHistory(entry);
            const history = db.getStatusHistory('sh1');
            (0, vitest_1.expect)(history).toHaveLength(1);
            (0, vitest_1.expect)(history[0].fromStatus).toBe('pending');
            (0, vitest_1.expect)(history[0].toStatus).toBe('in_progress');
            (0, vitest_1.expect)(history[0].fromColumn).toBe('todo');
            (0, vitest_1.expect)(history[0].toColumn).toBe('in_progress');
        });
        (0, vitest_1.it)('returns history in chronological order', () => {
            db.saveTask(makeTask('sh2'));
            db.addStatusHistory({ id: 'h2', taskId: 'sh2', fromStatus: 'pending', toStatus: 'in_progress', fromColumn: 'todo', toColumn: 'in_progress', changedAt: 1000 });
            db.addStatusHistory({ id: 'h3', taskId: 'sh2', fromStatus: 'in_progress', toStatus: 'completed', fromColumn: 'in_progress', toColumn: 'done', changedAt: 2000 });
            const history = db.getStatusHistory('sh2');
            (0, vitest_1.expect)(history).toHaveLength(2);
            (0, vitest_1.expect)(history[0].changedAt).toBe(1000);
            (0, vitest_1.expect)(history[1].changedAt).toBe(2000);
        });
        (0, vitest_1.it)('cascades history on task delete', () => {
            db.saveTask(makeTask('sh3'));
            db.addStatusHistory({ id: 'h4', taskId: 'sh3', fromStatus: 'pending', toStatus: 'in_progress', fromColumn: 'todo', toColumn: 'in_progress', changedAt: 1000 });
            db.deleteTask('sh3');
            (0, vitest_1.expect)(db.getStatusHistory('sh3')).toHaveLength(0);
        });
    });
});
//# sourceMappingURL=database.test.js.map