import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as actualPath from 'path';
import { TaskStatus, AgentRole, AIProvider, AgentState, PipelineStatus } from '../types';
import type { OrchestratorTask, AgentInstance, KanbanSwimLane, Pipeline, PipelineRun, AgentTeam, TaskStatusHistoryEntry, TaskComment } from '../types';

// The Database class does `require(path.join(__dirname, 'sql-wasm.js'))`.
// In test context __dirname is the src/ dir, not out/ where compiled files live.
// We mock the 'path' module to redirect sql-wasm lookups to node_modules.
vi.mock('path', async () => {
    const actual = await vi.importActual<typeof import('path')>('path');
    return {
        ...actual,
        default: {
            ...actual,
            join: (...args: string[]) => {
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
        join: (...args: string[]) => {
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

import { Database } from '../database';

// Use actual path.join for test setup (not the mocked one)
const realJoin = actualPath.join;

describe('Database', () => {
    let db: Database;
    let dbPath: string;

    beforeEach(async () => {
        dbPath = realJoin(os.tmpdir(), `test-db-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
        db = new Database(dbPath);
        await db.initialize();
    });

    afterEach(() => {
        db.close();
        try { fs.unlinkSync(dbPath); } catch {}
    });

    // ─── Initialization ──────────────────────────────────────────────────

    describe('initialize', () => {
        it('creates database and tables', () => {
            expect(db.getAllTasks()).toEqual([]);
            expect(db.getAllAgents()).toEqual([]);
            expect(db.getAllSwimLanes()).toEqual([]);
        });
    });

    // ─── Tasks ───────────────────────────────────────────────────────────

    describe('tasks', () => {
        const makeTask = (id: string, overrides: Partial<OrchestratorTask> = {}): OrchestratorTask => ({
            id,
            description: `Task ${id}`,
            status: TaskStatus.PENDING,
            priority: 5,
            createdAt: Date.now(),
            verificationStatus: 'none',
            ...overrides,
        });

        it('saves and retrieves a task', () => {
            const task = makeTask('t1');
            db.saveTask(task);
            const loaded = db.getTask('t1');
            expect(loaded).toBeDefined();
            expect(loaded!.id).toBe('t1');
            expect(loaded!.description).toBe('Task t1');
            expect(loaded!.status).toBe(TaskStatus.PENDING);
        });

        it('updates an existing task', () => {
            const task = makeTask('t2');
            db.saveTask(task);
            task.status = TaskStatus.COMPLETED;
            task.completedAt = Date.now();
            db.saveTask(task);
            const loaded = db.getTask('t2');
            expect(loaded!.status).toBe(TaskStatus.COMPLETED);
            expect(loaded!.completedAt).toBeDefined();
        });

        it('deletes a task', () => {
            db.saveTask(makeTask('t3'));
            db.deleteTask('t3');
            expect(db.getTask('t3')).toBeUndefined();
        });

        it('retrieves all tasks', () => {
            db.saveTask(makeTask('t4'));
            db.saveTask(makeTask('t5'));
            const all = db.getAllTasks();
            expect(all).toHaveLength(2);
        });

        it('saves and retrieves task with optional fields', () => {
            // Create referenced swim lane first (FK constraint)
            const lane: KanbanSwimLane = {
                id: 'lane-1', name: 'Test Lane', serverId: 'local',
                workingDirectory: '/tmp', sessionName: 'test',
                createdAt: Date.now(),
            };
            db.saveSwimLane(lane);

            const task = makeTask('t6', {
                targetRole: AgentRole.CODER,
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
            const loaded = db.getTask('t6')!;
            expect(loaded.targetRole).toBe(AgentRole.CODER);
            expect(loaded.swimLaneId).toBe('lane-1');
            expect(loaded.autoStart).toBe(true);
            expect(loaded.autoPilot).toBe(true);
            expect(loaded.autoClose).toBe(false);
        });

        it('saves and retrieves subtask relations', () => {
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

            const loaded = db.getTask('parent')!;
            expect(loaded.subtaskIds).toBeDefined();
            expect(loaded.subtaskIds!.sort()).toEqual(['child1', 'child2']);
        });

        it('retrieves tasks by swim lane', () => {
            // Create referenced swim lanes first (FK constraint)
            db.saveSwimLane({ id: 'lane-a', name: 'A', serverId: 'local', workingDirectory: '/tmp', sessionName: 'a', createdAt: Date.now() });
            db.saveSwimLane({ id: 'lane-b', name: 'B', serverId: 'local', workingDirectory: '/tmp', sessionName: 'b', createdAt: Date.now() });

            db.saveTask(makeTask('s1', { swimLaneId: 'lane-a' }));
            db.saveTask(makeTask('s2', { swimLaneId: 'lane-a' }));
            db.saveTask(makeTask('s3', { swimLaneId: 'lane-b' }));
            const laneTasks = db.getTasksBySwimLane('lane-a');
            expect(laneTasks).toHaveLength(2);
        });
    });

    // ─── Swim Lanes ──────────────────────────────────────────────────────

    describe('swim lanes', () => {
        it('saves and retrieves a swim lane', () => {
            const lane: KanbanSwimLane = {
                id: 'sl1', name: 'Frontend', serverId: 'local',
                workingDirectory: '/project', sessionName: 'frontend',
                createdAt: Date.now(), sessionActive: true,
            };
            db.saveSwimLane(lane);
            const loaded = db.getSwimLane('sl1');
            expect(loaded).toBeDefined();
            expect(loaded!.name).toBe('Frontend');
            expect(loaded!.sessionActive).toBe(true);
        });

        it('deletes a swim lane', () => {
            const lane: KanbanSwimLane = {
                id: 'sl2', name: 'Backend', serverId: 'local',
                workingDirectory: '/project', sessionName: 'backend',
                createdAt: Date.now(),
            };
            db.saveSwimLane(lane);
            db.deleteSwimLane('sl2');
            expect(db.getSwimLane('sl2')).toBeUndefined();
        });
    });

    // ─── Agents ──────────────────────────────────────────────────────────

    describe('agents', () => {
        const makeAgent = (id: string): AgentInstance => ({
            id, templateId: 'tmpl-1', name: `Agent ${id}`,
            role: AgentRole.CODER, aiProvider: AIProvider.CLAUDE,
            state: AgentState.IDLE, serverId: 'local',
            sessionName: 'sess', windowIndex: '0', paneIndex: '0',
            createdAt: Date.now(), lastActivityAt: Date.now(),
        });

        it('saves and retrieves an agent', () => {
            db.saveAgent(makeAgent('a1'));
            const loaded = db.getAgent('a1');
            expect(loaded).toBeDefined();
            expect(loaded!.name).toBe('Agent a1');
            expect(loaded!.role).toBe(AgentRole.CODER);
        });

        it('deletes an agent', () => {
            db.saveAgent(makeAgent('a2'));
            db.deleteAgent('a2');
            expect(db.getAgent('a2')).toBeUndefined();
        });
    });

    // ─── Teams ───────────────────────────────────────────────────────────

    describe('teams', () => {
        it('saves and retrieves a team with agents', () => {
            // Create agents first (FK constraint on team_agents)
            const makeAgent = (id: string): AgentInstance => ({
                id, templateId: 'tmpl-1', name: `Agent ${id}`,
                role: AgentRole.CODER, aiProvider: AIProvider.CLAUDE,
                state: AgentState.IDLE, serverId: 'local',
                sessionName: 'sess', windowIndex: '0', paneIndex: '0',
                createdAt: Date.now(), lastActivityAt: Date.now(),
            });
            db.saveAgent(makeAgent('a1'));
            db.saveAgent(makeAgent('a2'));

            const team: AgentTeam = {
                id: 'team1', name: 'Dev Team',
                agents: ['a1', 'a2'], createdAt: Date.now(),
            };
            db.saveTeam(team);
            const loaded = db.getTeam('team1');
            expect(loaded).toBeDefined();
            expect(loaded!.name).toBe('Dev Team');
            expect(loaded!.agents.sort()).toEqual(['a1', 'a2']);
        });

        it('deletes a team', () => {
            const team: AgentTeam = {
                id: 'team2', name: 'QA Team',
                agents: [], createdAt: Date.now(),
            };
            db.saveTeam(team);
            db.deleteTeam('team2');
            expect(db.getTeam('team2')).toBeUndefined();
        });
    });

    // ─── Pipelines ───────────────────────────────────────────────────────

    describe('pipelines', () => {
        it('saves and retrieves a pipeline', () => {
            const pipeline: Pipeline = {
                id: 'p1', name: 'Build Pipeline',
                stages: [{ id: 's1', name: 'Build', type: 'sequential' as any, agentRole: AgentRole.CODER, taskDescription: 'Build the app', dependsOn: [] }],
                createdAt: Date.now(), updatedAt: Date.now(),
            };
            db.savePipeline(pipeline);
            const loaded = db.getPipeline('p1');
            expect(loaded).toBeDefined();
            expect(loaded!.stages).toHaveLength(1);
            expect(loaded!.stages[0].name).toBe('Build');
        });

        it('deletes a pipeline', () => {
            const pipeline: Pipeline = {
                id: 'p2', name: 'Test Pipeline',
                stages: [], createdAt: Date.now(), updatedAt: Date.now(),
            };
            db.savePipeline(pipeline);
            db.deletePipeline('p2');
            expect(db.getPipeline('p2')).toBeUndefined();
        });
    });

    // ─── Pipeline Runs ───────────────────────────────────────────────────

    describe('pipeline runs', () => {
        it('saves and retrieves a pipeline run', () => {
            // Create referenced pipeline first (FK constraint)
            const pipeline: Pipeline = {
                id: 'p1', name: 'Test',
                stages: [], createdAt: Date.now(), updatedAt: Date.now(),
            };
            db.savePipeline(pipeline);

            const run: PipelineRun = {
                id: 'r1', pipelineId: 'p1',
                status: PipelineStatus.RUNNING,
                stageResults: { s1: { status: TaskStatus.COMPLETED } },
                startedAt: Date.now(),
            };
            db.savePipelineRun(run);
            const loaded = db.getPipelineRun('r1');
            expect(loaded).toBeDefined();
            expect(loaded!.status).toBe(PipelineStatus.RUNNING);
            expect(loaded!.stageResults.s1.status).toBe(TaskStatus.COMPLETED);
        });

        it('deletes a pipeline run', () => {
            // Create referenced pipeline first (FK constraint)
            const pipeline: Pipeline = {
                id: 'p1-del', name: 'Test',
                stages: [], createdAt: Date.now(), updatedAt: Date.now(),
            };
            db.savePipeline(pipeline);

            const run: PipelineRun = {
                id: 'r2', pipelineId: 'p1-del',
                status: PipelineStatus.DRAFT,
                stageResults: {}, startedAt: Date.now(),
            };
            db.savePipelineRun(run);
            db.deletePipelineRun('r2');
            expect(db.getPipelineRun('r2')).toBeUndefined();
        });
    });

    // ─── Task Comments ──────────────────────────────────────────────────

    describe('task comments', () => {
        const makeTask = (id: string, overrides: Partial<OrchestratorTask> = {}): OrchestratorTask => ({
            id,
            description: `Task ${id}`,
            status: TaskStatus.PENDING,
            priority: 5,
            createdAt: Date.now(),
            verificationStatus: 'none',
            ...overrides,
        });

        it('adds and retrieves comments', () => {
            db.saveTask(makeTask('ct1'));
            const c1: TaskComment = { id: 'c1', taskId: 'ct1', text: 'First comment', createdAt: 1000 };
            const c2: TaskComment = { id: 'c2', taskId: 'ct1', text: 'Second comment', createdAt: 2000 };
            db.addComment(c1);
            db.addComment(c2);
            const comments = db.getComments('ct1');
            expect(comments).toHaveLength(2);
            expect(comments[0].text).toBe('First comment');
            expect(comments[1].text).toBe('Second comment');
        });

        it('deletes a comment', () => {
            db.saveTask(makeTask('ct2'));
            db.addComment({ id: 'c3', taskId: 'ct2', text: 'To delete', createdAt: 1000 });
            db.deleteComment('c3');
            expect(db.getComments('ct2')).toHaveLength(0);
        });

        it('cascades comments on task delete', () => {
            db.saveTask(makeTask('ct3'));
            db.addComment({ id: 'c4', taskId: 'ct3', text: 'Will cascade', createdAt: 1000 });
            db.deleteTask('ct3');
            expect(db.getComments('ct3')).toHaveLength(0);
        });
    });

    // ─── Task Tags ──────────────────────────────────────────────────────

    describe('task tags', () => {
        const makeTask = (id: string, overrides: Partial<OrchestratorTask> = {}): OrchestratorTask => ({
            id,
            description: `Task ${id}`,
            status: TaskStatus.PENDING,
            priority: 5,
            createdAt: Date.now(),
            verificationStatus: 'none',
            ...overrides,
        });

        it('saves and retrieves tags', () => {
            db.saveTask(makeTask('tt1'));
            db.saveTags('tt1', ['bug', 'urgent']);
            const tags = db.getTags('tt1');
            expect(tags.sort()).toEqual(['bug', 'urgent']);
        });

        it('replaces tags on re-save', () => {
            db.saveTask(makeTask('tt2'));
            db.saveTags('tt2', ['feature', 'docs']);
            db.saveTags('tt2', ['refactor']);
            const tags = db.getTags('tt2');
            expect(tags).toEqual(['refactor']);
        });

        it('cascades tags on task delete', () => {
            db.saveTask(makeTask('tt3'));
            db.saveTags('tt3', ['test']);
            db.deleteTask('tt3');
            expect(db.getTags('tt3')).toHaveLength(0);
        });
    });

    // ─── Task Status History ────────────────────────────────────────────

    describe('task status history', () => {
        const makeTask = (id: string, overrides: Partial<OrchestratorTask> = {}): OrchestratorTask => ({
            id,
            description: `Task ${id}`,
            status: TaskStatus.PENDING,
            priority: 5,
            createdAt: Date.now(),
            verificationStatus: 'none',
            ...overrides,
        });

        it('adds and retrieves status history', () => {
            db.saveTask(makeTask('sh1'));
            const entry: TaskStatusHistoryEntry = {
                id: 'h1', taskId: 'sh1',
                fromStatus: 'pending', toStatus: 'in_progress',
                fromColumn: 'todo', toColumn: 'in_progress',
                changedAt: 1000
            };
            db.addStatusHistory(entry);
            const history = db.getStatusHistory('sh1');
            expect(history).toHaveLength(1);
            expect(history[0].fromStatus).toBe('pending');
            expect(history[0].toStatus).toBe('in_progress');
            expect(history[0].fromColumn).toBe('todo');
            expect(history[0].toColumn).toBe('in_progress');
        });

        it('returns history in chronological order', () => {
            db.saveTask(makeTask('sh2'));
            db.addStatusHistory({ id: 'h2', taskId: 'sh2', fromStatus: 'pending', toStatus: 'in_progress', fromColumn: 'todo', toColumn: 'in_progress', changedAt: 1000 });
            db.addStatusHistory({ id: 'h3', taskId: 'sh2', fromStatus: 'in_progress', toStatus: 'completed', fromColumn: 'in_progress', toColumn: 'done', changedAt: 2000 });
            const history = db.getStatusHistory('sh2');
            expect(history).toHaveLength(2);
            expect(history[0].changedAt).toBe(1000);
            expect(history[1].changedAt).toBe(2000);
        });

        it('cascades history on task delete', () => {
            db.saveTask(makeTask('sh3'));
            db.addStatusHistory({ id: 'h4', taskId: 'sh3', fromStatus: 'pending', toStatus: 'in_progress', fromColumn: 'todo', toColumn: 'in_progress', changedAt: 1000 });
            db.deleteTask('sh3');
            expect(db.getStatusHistory('sh3')).toHaveLength(0);
        });
    });
});
