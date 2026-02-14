"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pipelineEngine_1 = require("../core/pipelineEngine");
const types_1 = require("../core/types");
(0, vitest_1.describe)('PipelineEngine', () => {
    let engine;
    (0, vitest_1.beforeEach)(() => {
        engine = new pipelineEngine_1.PipelineEngine();
    });
    // ─── Pipeline CRUD ───────────────────────────────────────────────────
    (0, vitest_1.describe)('createPipeline', () => {
        (0, vitest_1.it)('creates a pipeline with name and empty stages', () => {
            const pipeline = engine.createPipeline('My Pipeline', 'A test pipeline');
            (0, vitest_1.expect)(pipeline.name).toBe('My Pipeline');
            (0, vitest_1.expect)(pipeline.description).toBe('A test pipeline');
            (0, vitest_1.expect)(pipeline.stages).toEqual([]);
            (0, vitest_1.expect)(pipeline.id).toBeTruthy();
        });
    });
    (0, vitest_1.describe)('addStage', () => {
        (0, vitest_1.it)('adds a stage to an existing pipeline', () => {
            const pipeline = engine.createPipeline('P1');
            const stage = engine.addStage(pipeline.id, {
                name: 'Build',
                type: types_1.StageType.SEQUENTIAL,
                agentRole: types_1.AgentRole.CODER,
                taskDescription: 'Build the app',
                dependsOn: [],
            });
            (0, vitest_1.expect)(stage.id).toBeTruthy();
            (0, vitest_1.expect)(stage.name).toBe('Build');
            (0, vitest_1.expect)(engine.getPipeline(pipeline.id).stages).toHaveLength(1);
        });
        (0, vitest_1.it)('throws for non-existent pipeline', () => {
            (0, vitest_1.expect)(() => engine.addStage('fake-id', {
                name: 'X', type: types_1.StageType.SEQUENTIAL,
                agentRole: types_1.AgentRole.CODER, taskDescription: 'X', dependsOn: [],
            })).toThrow('Pipeline not found');
        });
    });
    (0, vitest_1.describe)('removeStage', () => {
        (0, vitest_1.it)('removes a stage from the pipeline', () => {
            const pipeline = engine.createPipeline('P1');
            const stage = engine.addStage(pipeline.id, {
                name: 'Build', type: types_1.StageType.SEQUENTIAL,
                agentRole: types_1.AgentRole.CODER, taskDescription: 'Build', dependsOn: [],
            });
            engine.removeStage(pipeline.id, stage.id);
            (0, vitest_1.expect)(engine.getPipeline(pipeline.id).stages).toHaveLength(0);
        });
        (0, vitest_1.it)('throws for non-existent stage', () => {
            const pipeline = engine.createPipeline('P1');
            (0, vitest_1.expect)(() => engine.removeStage(pipeline.id, 'fake')).toThrow('Stage not found');
        });
    });
    (0, vitest_1.describe)('deletePipeline', () => {
        (0, vitest_1.it)('removes a pipeline', () => {
            const pipeline = engine.createPipeline('P1');
            engine.deletePipeline(pipeline.id);
            (0, vitest_1.expect)(engine.getPipeline(pipeline.id)).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('getAllPipelines', () => {
        (0, vitest_1.it)('returns all created pipelines', () => {
            engine.createPipeline('P1');
            engine.createPipeline('P2');
            (0, vitest_1.expect)(engine.getAllPipelines()).toHaveLength(2);
        });
    });
    // ─── Run Management ──────────────────────────────────────────────────
    (0, vitest_1.describe)('startRun', () => {
        (0, vitest_1.it)('creates a run in RUNNING status', () => {
            const pipeline = engine.createPipeline('P1');
            const run = engine.startRun(pipeline.id);
            (0, vitest_1.expect)(run.status).toBe(types_1.PipelineStatus.RUNNING);
            (0, vitest_1.expect)(run.pipelineId).toBe(pipeline.id);
            (0, vitest_1.expect)(run.stageResults).toEqual({});
        });
        (0, vitest_1.it)('throws for non-existent pipeline', () => {
            (0, vitest_1.expect)(() => engine.startRun('fake')).toThrow('Pipeline not found');
        });
    });
    (0, vitest_1.describe)('getReadyStages', () => {
        (0, vitest_1.it)('returns stages with all dependencies completed', () => {
            const pipeline = engine.createPipeline('P1');
            const s1 = engine.addStage(pipeline.id, {
                name: 'Build', type: types_1.StageType.SEQUENTIAL,
                agentRole: types_1.AgentRole.CODER, taskDescription: 'Build', dependsOn: [],
            });
            const s2 = engine.addStage(pipeline.id, {
                name: 'Test', type: types_1.StageType.SEQUENTIAL,
                agentRole: types_1.AgentRole.TESTER, taskDescription: 'Test', dependsOn: [s1.id],
            });
            const run = engine.startRun(pipeline.id);
            // Initially only s1 is ready (no dependencies)
            let ready = engine.getReadyStages(run);
            (0, vitest_1.expect)(ready).toHaveLength(1);
            (0, vitest_1.expect)(ready[0].id).toBe(s1.id);
            // After completing s1, s2 becomes ready
            engine.markStageStarted(run.id, s1.id, 'agent1');
            engine.markStageCompleted(run.id, s1.id, 'build done');
            ready = engine.getReadyStages(run);
            (0, vitest_1.expect)(ready).toHaveLength(1);
            (0, vitest_1.expect)(ready[0].id).toBe(s2.id);
        });
    });
    (0, vitest_1.describe)('markStageCompleted', () => {
        (0, vitest_1.it)('marks the run as COMPLETED when all stages finish', () => {
            const pipeline = engine.createPipeline('P1');
            const s1 = engine.addStage(pipeline.id, {
                name: 'Only Stage', type: types_1.StageType.SEQUENTIAL,
                agentRole: types_1.AgentRole.CODER, taskDescription: 'Do it', dependsOn: [],
            });
            const run = engine.startRun(pipeline.id);
            engine.markStageStarted(run.id, s1.id, 'agent1');
            engine.markStageCompleted(run.id, s1.id, 'done');
            const updatedRun = engine.getRun(run.id);
            (0, vitest_1.expect)(updatedRun.status).toBe(types_1.PipelineStatus.COMPLETED);
            (0, vitest_1.expect)(updatedRun.completedAt).toBeDefined();
        });
    });
    (0, vitest_1.describe)('markStageFailed', () => {
        (0, vitest_1.it)('pauses the run on stage failure', () => {
            const pipeline = engine.createPipeline('P1');
            const s1 = engine.addStage(pipeline.id, {
                name: 'Build', type: types_1.StageType.SEQUENTIAL,
                agentRole: types_1.AgentRole.CODER, taskDescription: 'Build', dependsOn: [],
            });
            const run = engine.startRun(pipeline.id);
            engine.markStageStarted(run.id, s1.id, 'agent1');
            engine.markStageFailed(run.id, s1.id, 'compile error');
            const updatedRun = engine.getRun(run.id);
            (0, vitest_1.expect)(updatedRun.status).toBe(types_1.PipelineStatus.PAUSED);
            (0, vitest_1.expect)(updatedRun.stageResults[s1.id].errorMessage).toBe('compile error');
        });
    });
    (0, vitest_1.describe)('pause and resume', () => {
        (0, vitest_1.it)('pauses and resumes a run', () => {
            const pipeline = engine.createPipeline('P1');
            engine.addStage(pipeline.id, {
                name: 'S1', type: types_1.StageType.SEQUENTIAL,
                agentRole: types_1.AgentRole.CODER, taskDescription: 'Do', dependsOn: [],
            });
            const run = engine.startRun(pipeline.id);
            engine.pauseRun(run.id);
            (0, vitest_1.expect)(engine.getRun(run.id).status).toBe(types_1.PipelineStatus.PAUSED);
            engine.resumeRun(run.id);
            (0, vitest_1.expect)(engine.getRun(run.id).status).toBe(types_1.PipelineStatus.RUNNING);
        });
    });
    // ─── Built-in pipelines ──────────────────────────────────────────────
    (0, vitest_1.describe)('getBuiltInPipelines', () => {
        (0, vitest_1.it)('returns 3 built-in pipeline templates', () => {
            const builtins = engine.getBuiltInPipelines();
            (0, vitest_1.expect)(builtins).toHaveLength(3);
            (0, vitest_1.expect)(builtins.map(p => p.name)).toContain('Code Review Pipeline');
            (0, vitest_1.expect)(builtins.map(p => p.name)).toContain('Full Development Pipeline');
            (0, vitest_1.expect)(builtins.map(p => p.name)).toContain('Research & Implement');
        });
    });
});
//# sourceMappingURL=pipelineEngine.test.js.map