import { Pipeline, PipelineStage, PipelineRun, StageResult, OrchestratorTask } from './types';
import { Disposable } from './disposable';
export declare class PipelineEngine implements Disposable {
    private pipelines;
    private activeRuns;
    private _onPipelineStatusChanged;
    readonly onPipelineStatusChanged: import("./eventEmitter").Event<PipelineRun>;
    private _onStageCompleted;
    readonly onStageCompleted: import("./eventEmitter").Event<{
        runId: string;
        stageId: string;
        result: StageResult;
    }>;
    createPipeline(name: string, description?: string): Pipeline;
    addStage(pipelineId: string, stage: Omit<PipelineStage, 'id'>): PipelineStage;
    removeStage(pipelineId: string, stageId: string): void;
    getPipeline(id: string): Pipeline | undefined;
    getAllPipelines(): Pipeline[];
    deletePipeline(id: string): void;
    savePipeline(pipeline: Pipeline): void;
    startRun(pipelineId: string): PipelineRun;
    getReadyStages(run: PipelineRun): PipelineStage[];
    markStageStarted(runId: string, stageId: string, agentId: string): void;
    markStageCompleted(runId: string, stageId: string, output?: string): void;
    markStageFailed(runId: string, stageId: string, error: string): void;
    pauseRun(runId: string): void;
    resumeRun(runId: string): void;
    getActiveRuns(): PipelineRun[];
    getRun(runId: string): PipelineRun | undefined;
    generateTasksForStage(pipeline: Pipeline, stage: PipelineStage, previousOutputs?: Record<string, string>): OrchestratorTask[];
    getBuiltInPipelines(): Pipeline[];
    createPipelineFromDescription(description: string): Promise<Pipeline>;
    dispose(): void;
}
//# sourceMappingURL=pipelineEngine.d.ts.map