import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineEngine } from '../core/pipelineEngine';
import { AgentRole, PipelineStatus, StageType, TaskStatus } from '../core/types';

describe('PipelineEngine', () => {
    let engine: PipelineEngine;

    beforeEach(() => {
        engine = new PipelineEngine();
    });

    // ─── Pipeline CRUD ───────────────────────────────────────────────────

    describe('createPipeline', () => {
        it('creates a pipeline with name and empty stages', () => {
            const pipeline = engine.createPipeline('My Pipeline', 'A test pipeline');
            expect(pipeline.name).toBe('My Pipeline');
            expect(pipeline.description).toBe('A test pipeline');
            expect(pipeline.stages).toEqual([]);
            expect(pipeline.id).toBeTruthy();
        });
    });

    describe('addStage', () => {
        it('adds a stage to an existing pipeline', () => {
            const pipeline = engine.createPipeline('P1');
            const stage = engine.addStage(pipeline.id, {
                name: 'Build',
                type: StageType.SEQUENTIAL,
                agentRole: AgentRole.CODER,
                taskDescription: 'Build the app',
                dependsOn: [],
            });
            expect(stage.id).toBeTruthy();
            expect(stage.name).toBe('Build');
            expect(engine.getPipeline(pipeline.id)!.stages).toHaveLength(1);
        });

        it('throws for non-existent pipeline', () => {
            expect(() => engine.addStage('fake-id', {
                name: 'X', type: StageType.SEQUENTIAL,
                agentRole: AgentRole.CODER, taskDescription: 'X', dependsOn: [],
            })).toThrow('Pipeline not found');
        });
    });

    describe('removeStage', () => {
        it('removes a stage from the pipeline', () => {
            const pipeline = engine.createPipeline('P1');
            const stage = engine.addStage(pipeline.id, {
                name: 'Build', type: StageType.SEQUENTIAL,
                agentRole: AgentRole.CODER, taskDescription: 'Build', dependsOn: [],
            });
            engine.removeStage(pipeline.id, stage.id);
            expect(engine.getPipeline(pipeline.id)!.stages).toHaveLength(0);
        });

        it('throws for non-existent stage', () => {
            const pipeline = engine.createPipeline('P1');
            expect(() => engine.removeStage(pipeline.id, 'fake')).toThrow('Stage not found');
        });
    });

    describe('deletePipeline', () => {
        it('removes a pipeline', () => {
            const pipeline = engine.createPipeline('P1');
            engine.deletePipeline(pipeline.id);
            expect(engine.getPipeline(pipeline.id)).toBeUndefined();
        });
    });

    describe('getAllPipelines', () => {
        it('returns all created pipelines', () => {
            engine.createPipeline('P1');
            engine.createPipeline('P2');
            expect(engine.getAllPipelines()).toHaveLength(2);
        });
    });

    // ─── Run Management ──────────────────────────────────────────────────

    describe('startRun', () => {
        it('creates a run in RUNNING status', () => {
            const pipeline = engine.createPipeline('P1');
            const run = engine.startRun(pipeline.id);
            expect(run.status).toBe(PipelineStatus.RUNNING);
            expect(run.pipelineId).toBe(pipeline.id);
            expect(run.stageResults).toEqual({});
        });

        it('throws for non-existent pipeline', () => {
            expect(() => engine.startRun('fake')).toThrow('Pipeline not found');
        });
    });

    describe('getReadyStages', () => {
        it('returns stages with all dependencies completed', () => {
            const pipeline = engine.createPipeline('P1');
            const s1 = engine.addStage(pipeline.id, {
                name: 'Build', type: StageType.SEQUENTIAL,
                agentRole: AgentRole.CODER, taskDescription: 'Build', dependsOn: [],
            });
            const s2 = engine.addStage(pipeline.id, {
                name: 'Test', type: StageType.SEQUENTIAL,
                agentRole: AgentRole.TESTER, taskDescription: 'Test', dependsOn: [s1.id],
            });

            const run = engine.startRun(pipeline.id);

            // Initially only s1 is ready (no dependencies)
            let ready = engine.getReadyStages(run);
            expect(ready).toHaveLength(1);
            expect(ready[0].id).toBe(s1.id);

            // After completing s1, s2 becomes ready
            engine.markStageStarted(run.id, s1.id, 'agent1');
            engine.markStageCompleted(run.id, s1.id, 'build done');

            ready = engine.getReadyStages(run);
            expect(ready).toHaveLength(1);
            expect(ready[0].id).toBe(s2.id);
        });
    });

    describe('markStageCompleted', () => {
        it('marks the run as COMPLETED when all stages finish', () => {
            const pipeline = engine.createPipeline('P1');
            const s1 = engine.addStage(pipeline.id, {
                name: 'Only Stage', type: StageType.SEQUENTIAL,
                agentRole: AgentRole.CODER, taskDescription: 'Do it', dependsOn: [],
            });

            const run = engine.startRun(pipeline.id);
            engine.markStageStarted(run.id, s1.id, 'agent1');
            engine.markStageCompleted(run.id, s1.id, 'done');

            const updatedRun = engine.getRun(run.id)!;
            expect(updatedRun.status).toBe(PipelineStatus.COMPLETED);
            expect(updatedRun.completedAt).toBeDefined();
        });
    });

    describe('markStageFailed', () => {
        it('pauses the run on stage failure', () => {
            const pipeline = engine.createPipeline('P1');
            const s1 = engine.addStage(pipeline.id, {
                name: 'Build', type: StageType.SEQUENTIAL,
                agentRole: AgentRole.CODER, taskDescription: 'Build', dependsOn: [],
            });

            const run = engine.startRun(pipeline.id);
            engine.markStageStarted(run.id, s1.id, 'agent1');
            engine.markStageFailed(run.id, s1.id, 'compile error');

            const updatedRun = engine.getRun(run.id)!;
            expect(updatedRun.status).toBe(PipelineStatus.PAUSED);
            expect(updatedRun.stageResults[s1.id].errorMessage).toBe('compile error');
        });
    });

    describe('pause and resume', () => {
        it('pauses and resumes a run', () => {
            const pipeline = engine.createPipeline('P1');
            engine.addStage(pipeline.id, {
                name: 'S1', type: StageType.SEQUENTIAL,
                agentRole: AgentRole.CODER, taskDescription: 'Do', dependsOn: [],
            });
            const run = engine.startRun(pipeline.id);

            engine.pauseRun(run.id);
            expect(engine.getRun(run.id)!.status).toBe(PipelineStatus.PAUSED);

            engine.resumeRun(run.id);
            expect(engine.getRun(run.id)!.status).toBe(PipelineStatus.RUNNING);
        });
    });

    // ─── Built-in pipelines ──────────────────────────────────────────────

    describe('getBuiltInPipelines', () => {
        it('returns 3 built-in pipeline templates', () => {
            const builtins = engine.getBuiltInPipelines();
            expect(builtins).toHaveLength(3);
            expect(builtins.map(p => p.name)).toContain('Code Review Pipeline');
            expect(builtins.map(p => p.name)).toContain('Full Development Pipeline');
            expect(builtins.map(p => p.name)).toContain('Research & Implement');
        });
    });
});
