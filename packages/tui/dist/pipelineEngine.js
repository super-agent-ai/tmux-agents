import * as vscode from 'vscode';
import { PipelineStatus, StageType, TaskStatus, AgentRole } from './types';
function generateId() {
    return crypto.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
export class PipelineEngine {
    constructor() {
        this.pipelines = new Map();
        this.activeRuns = new Map();
        this._onPipelineStatusChanged = new vscode.EventEmitter();
        this.onPipelineStatusChanged = this._onPipelineStatusChanged.event;
        this._onStageCompleted = new vscode.EventEmitter();
        this.onStageCompleted = this._onStageCompleted.event;
    }
    // ─── Pipeline CRUD ───────────────────────────────────────────────────────
    createPipeline(name, description) {
        const now = Date.now();
        const pipeline = {
            id: generateId(),
            name,
            description,
            stages: [],
            createdAt: now,
            updatedAt: now
        };
        this.pipelines.set(pipeline.id, pipeline);
        return pipeline;
    }
    addStage(pipelineId, stage) {
        const pipeline = this.pipelines.get(pipelineId);
        if (!pipeline) {
            throw new Error(`Pipeline not found: ${pipelineId}`);
        }
        const fullStage = {
            ...stage,
            id: generateId()
        };
        pipeline.stages.push(fullStage);
        pipeline.updatedAt = Date.now();
        return fullStage;
    }
    removeStage(pipelineId, stageId) {
        const pipeline = this.pipelines.get(pipelineId);
        if (!pipeline) {
            throw new Error(`Pipeline not found: ${pipelineId}`);
        }
        const index = pipeline.stages.findIndex(s => s.id === stageId);
        if (index === -1) {
            throw new Error(`Stage not found: ${stageId}`);
        }
        pipeline.stages.splice(index, 1);
        pipeline.updatedAt = Date.now();
    }
    getPipeline(id) {
        return this.pipelines.get(id);
    }
    getAllPipelines() {
        return Array.from(this.pipelines.values());
    }
    deletePipeline(id) {
        this.pipelines.delete(id);
    }
    savePipeline(pipeline) {
        pipeline.updatedAt = Date.now();
        this.pipelines.set(pipeline.id, pipeline);
    }
    // ─── Run Management ──────────────────────────────────────────────────────
    startRun(pipelineId) {
        const pipeline = this.pipelines.get(pipelineId);
        if (!pipeline) {
            throw new Error(`Pipeline not found: ${pipelineId}`);
        }
        const run = {
            id: generateId(),
            pipelineId,
            status: PipelineStatus.RUNNING,
            stageResults: {},
            startedAt: Date.now()
        };
        this.activeRuns.set(run.id, run);
        this._onPipelineStatusChanged.fire(run);
        return run;
    }
    getReadyStages(run) {
        const pipeline = this.pipelines.get(run.pipelineId);
        if (!pipeline) {
            return [];
        }
        return pipeline.stages.filter(stage => {
            // Stage already has a result (started, completed, or failed) — skip
            if (run.stageResults[stage.id]) {
                return false;
            }
            // All dependencies must be completed
            return stage.dependsOn.every(depId => {
                const depResult = run.stageResults[depId];
                return depResult && depResult.status === TaskStatus.COMPLETED;
            });
        });
    }
    markStageStarted(runId, stageId, agentId) {
        const run = this.activeRuns.get(runId);
        if (!run) {
            throw new Error(`Run not found: ${runId}`);
        }
        run.stageResults[stageId] = {
            status: TaskStatus.IN_PROGRESS,
            agentId,
            startedAt: Date.now()
        };
    }
    markStageCompleted(runId, stageId, output) {
        const run = this.activeRuns.get(runId);
        if (!run) {
            throw new Error(`Run not found: ${runId}`);
        }
        const existing = run.stageResults[stageId];
        run.stageResults[stageId] = {
            ...existing,
            status: TaskStatus.COMPLETED,
            output,
            completedAt: Date.now()
        };
        const result = run.stageResults[stageId];
        this._onStageCompleted.fire({ runId, stageId, result });
        // Check if all stages in the pipeline are completed
        const pipeline = this.pipelines.get(run.pipelineId);
        if (pipeline) {
            const allCompleted = pipeline.stages.every(stage => {
                const stageResult = run.stageResults[stage.id];
                return stageResult && stageResult.status === TaskStatus.COMPLETED;
            });
            if (allCompleted) {
                run.status = PipelineStatus.COMPLETED;
                run.completedAt = Date.now();
                this._onPipelineStatusChanged.fire(run);
            }
        }
    }
    markStageFailed(runId, stageId, error) {
        const run = this.activeRuns.get(runId);
        if (!run) {
            throw new Error(`Run not found: ${runId}`);
        }
        const existing = run.stageResults[stageId];
        run.stageResults[stageId] = {
            ...existing,
            status: TaskStatus.FAILED,
            errorMessage: error,
            completedAt: Date.now()
        };
        // Pause on error — user decides whether to retry or abort
        run.status = PipelineStatus.PAUSED;
        this._onPipelineStatusChanged.fire(run);
    }
    pauseRun(runId) {
        const run = this.activeRuns.get(runId);
        if (!run) {
            throw new Error(`Run not found: ${runId}`);
        }
        run.status = PipelineStatus.PAUSED;
        this._onPipelineStatusChanged.fire(run);
    }
    resumeRun(runId) {
        const run = this.activeRuns.get(runId);
        if (!run) {
            throw new Error(`Run not found: ${runId}`);
        }
        run.status = PipelineStatus.RUNNING;
        this._onPipelineStatusChanged.fire(run);
    }
    getActiveRuns() {
        return Array.from(this.activeRuns.values());
    }
    getRun(runId) {
        return this.activeRuns.get(runId);
    }
    // ─── Task Generation ─────────────────────────────────────────────────────
    generateTasksForStage(pipeline, stage, previousOutputs) {
        const tasks = [];
        const count = stage.type === StageType.FAN_OUT ? (stage.fanOutCount ?? 1) : 1;
        // Build context from predecessor stage outputs
        let contextPrefix = '';
        if (previousOutputs && stage.dependsOn.length > 0) {
            const parts = [];
            for (const depId of stage.dependsOn) {
                const depStage = pipeline.stages.find(s => s.id === depId);
                if (depStage && previousOutputs[depId]) {
                    parts.push(`[Output from "${depStage.name}"]: ${previousOutputs[depId]}`);
                }
            }
            if (parts.length > 0) {
                contextPrefix = parts.join('\n') + '\n\nYour task: ';
            }
        }
        for (let i = 0; i < count; i++) {
            const task = {
                id: generateId(),
                description: count > 1
                    ? `${contextPrefix}${stage.taskDescription} (${i + 1}/${count})`
                    : `${contextPrefix}${stage.taskDescription}`,
                targetRole: stage.agentRole,
                status: TaskStatus.PENDING,
                priority: 8,
                pipelineStageId: stage.id,
                createdAt: Date.now()
            };
            tasks.push(task);
        }
        return tasks;
    }
    // ─── Built-in Pipeline Templates ─────────────────────────────────────────
    getBuiltInPipelines() {
        const now = Date.now();
        // Code Review Pipeline: write-code → review → fix-issues
        const codeReviewId = 'builtin-code-review';
        const crStage1Id = 'cr-stage-write';
        const crStage2Id = 'cr-stage-review';
        const crStage3Id = 'cr-stage-fix';
        const codeReview = {
            id: codeReviewId,
            name: 'Code Review Pipeline',
            description: 'Write code, review it, then fix issues',
            stages: [
                {
                    id: crStage1Id,
                    name: 'Write Code',
                    type: StageType.SEQUENTIAL,
                    agentRole: AgentRole.CODER,
                    taskDescription: 'Write code according to specifications',
                    dependsOn: []
                },
                {
                    id: crStage2Id,
                    name: 'Review',
                    type: StageType.SEQUENTIAL,
                    agentRole: AgentRole.REVIEWER,
                    taskDescription: 'Review the written code for quality and correctness',
                    dependsOn: [crStage1Id]
                },
                {
                    id: crStage3Id,
                    name: 'Fix Issues',
                    type: StageType.SEQUENTIAL,
                    agentRole: AgentRole.CODER,
                    taskDescription: 'Fix issues found during code review',
                    dependsOn: [crStage2Id]
                }
            ],
            createdAt: now,
            updatedAt: now
        };
        // Full Development Pipeline: write-code → review → write-tests → fix-issues
        const fullDevId = 'builtin-full-dev';
        const fdStage1Id = 'fd-stage-write';
        const fdStage2Id = 'fd-stage-review';
        const fdStage3Id = 'fd-stage-test';
        const fdStage4Id = 'fd-stage-fix';
        const fullDev = {
            id: fullDevId,
            name: 'Full Development Pipeline',
            description: 'Write code, review, write tests, then fix issues',
            stages: [
                {
                    id: fdStage1Id,
                    name: 'Write Code',
                    type: StageType.SEQUENTIAL,
                    agentRole: AgentRole.CODER,
                    taskDescription: 'Write code according to specifications',
                    dependsOn: []
                },
                {
                    id: fdStage2Id,
                    name: 'Review',
                    type: StageType.SEQUENTIAL,
                    agentRole: AgentRole.REVIEWER,
                    taskDescription: 'Review the written code for quality and correctness',
                    dependsOn: [fdStage1Id]
                },
                {
                    id: fdStage3Id,
                    name: 'Write Tests',
                    type: StageType.SEQUENTIAL,
                    agentRole: AgentRole.TESTER,
                    taskDescription: 'Write comprehensive tests for the code',
                    dependsOn: [fdStage2Id]
                },
                {
                    id: fdStage4Id,
                    name: 'Fix Issues',
                    type: StageType.SEQUENTIAL,
                    agentRole: AgentRole.CODER,
                    taskDescription: 'Fix issues found during review and testing',
                    dependsOn: [fdStage3Id]
                }
            ],
            createdAt: now,
            updatedAt: now
        };
        // Research & Implement Pipeline: research → implement → test
        const researchId = 'builtin-research-implement';
        const riStage1Id = 'ri-stage-research';
        const riStage2Id = 'ri-stage-implement';
        const riStage3Id = 'ri-stage-test';
        const researchImplement = {
            id: researchId,
            name: 'Research & Implement',
            description: 'Research a topic, implement a solution, then test it',
            stages: [
                {
                    id: riStage1Id,
                    name: 'Research',
                    type: StageType.SEQUENTIAL,
                    agentRole: AgentRole.RESEARCHER,
                    taskDescription: 'Research the problem domain and gather information',
                    dependsOn: []
                },
                {
                    id: riStage2Id,
                    name: 'Implement',
                    type: StageType.SEQUENTIAL,
                    agentRole: AgentRole.CODER,
                    taskDescription: 'Implement the solution based on research findings',
                    dependsOn: [riStage1Id]
                },
                {
                    id: riStage3Id,
                    name: 'Test',
                    type: StageType.SEQUENTIAL,
                    agentRole: AgentRole.TESTER,
                    taskDescription: 'Test the implemented solution',
                    dependsOn: [riStage2Id]
                }
            ],
            createdAt: now,
            updatedAt: now
        };
        return [codeReview, fullDev, researchImplement];
    }
    async createPipelineFromDescription(description) {
        const pipeline = this.createPipeline(description.slice(0, 50).replace(/[^a-zA-Z0-9 ]/g, '').trim());
        try {
            const { execSync } = require('child_process');
            const prompt = `You are a pipeline designer for an AI agent orchestration system. Break the given task into a pipeline of 2-5 stages.

## Output Format
Output ONLY a JSON array of stages. Each stage: {"name": "...", "role": "coder|reviewer|tester|researcher|devops", "type": "sequential", "task": "...", "dependsOn": []}

## Stage Design Rules
- **Names**: Use short, descriptive kebab-case names (e.g., "implement-api", "write-tests", "review-changes")
- **Dependencies**: The first stage must have an empty dependsOn array. Later stages reference predecessor stage names they depend on.
- **Granularity**: Each stage should be a single coherent unit of work that one agent can complete independently.
- **Task descriptions**: Write specific, actionable instructions the agent can execute without clarification. Include relevant file paths or module names when possible.
- **Roles**: Choose the most appropriate role — coder for implementation, tester for tests, reviewer for review, researcher for investigation, devops for infrastructure.
- **Final stage**: When the task involves code changes, end with a reviewer or tester stage that verifies the work done in prior stages.

Task: ${description}`;
            const result = execSync(`echo ${JSON.stringify(prompt)} | claude --print -`, { timeout: 30000, encoding: 'utf-8' });
            const jsonMatch = result.match(/\[[\s\S]*?\]/);
            if (jsonMatch) {
                const stages = JSON.parse(jsonMatch[0]);
                const nameToId = new Map();
                for (const s of stages) {
                    const role = Object.values(AgentRole).includes(s.role) ? s.role : AgentRole.CODER;
                    const added = this.addStage(pipeline.id, {
                        name: s.name,
                        type: StageType.SEQUENTIAL,
                        agentRole: role,
                        taskDescription: s.task,
                        dependsOn: (s.dependsOn || []).map(n => nameToId.get(n)).filter((id) => !!id)
                    });
                    nameToId.set(s.name, added.id);
                }
            }
        }
        catch {
            // If Claude CLI fails, create a simple single-stage pipeline
            this.addStage(pipeline.id, {
                name: 'Execute',
                type: StageType.SEQUENTIAL,
                agentRole: AgentRole.CODER,
                taskDescription: description,
                dependsOn: []
            });
        }
        return pipeline;
    }
    // ─── Disposal ────────────────────────────────────────────────────────────
    dispose() {
        this._onPipelineStatusChanged.dispose();
        this._onStageCompleted.dispose();
    }
}
//# sourceMappingURL=pipelineEngine.js.map