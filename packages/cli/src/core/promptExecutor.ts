import { PromptRegistry, PromptExecutionResult } from './promptRegistry';
import { OrchestratorTask, TaskStatus, KanbanSwimLane } from './types';
import { buildSingleTaskPrompt, appendPromptTail } from './promptBuilder';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PromptExecutorContext {
    promptRegistry: PromptRegistry;
    submitTask: (task: OrchestratorTask) => void;
    saveTask: (task: OrchestratorTask) => void;
    startTaskFlow: (task: OrchestratorTask) => Promise<void>;
    swimLanes: KanbanSwimLane[];
}

export interface ExecutePromptRequest {
    slug: string;
    inputs: Record<string, string>;
    swimLaneId?: string;
    autoStart?: boolean;
}

export interface ExecutePromptResponse {
    success: boolean;
    taskId?: string;
    resolvedPrompt?: string;
    error?: string;
    validationErrors?: Array<{ field: string; message: string }>;
}

// ─── Handler Interface ──────────────────────────────────────────────────────

export interface PromptHandler {
    readonly slug: string;
    execute(request: ExecutePromptRequest, ctx: PromptExecutorContext): ExecutePromptResponse;
}

// ─── Concrete Handlers ──────────────────────────────────────────────────────

function generateId(): string {
    return 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

export class CreateTestPlanHandler implements PromptHandler {
    readonly slug = 'create-test-plans';

    execute(request: ExecutePromptRequest, ctx: PromptExecutorContext): ExecutePromptResponse {
        const result = ctx.promptRegistry.resolvePrompt(this.slug, request.inputs);
        if (!result.success) {
            return {
                success: false,
                error: result.error,
                validationErrors: ctx.promptRegistry.validateInputs(this.slug, request.inputs),
            };
        }

        const task = this.buildTask(result, request);
        ctx.submitTask(task);
        ctx.saveTask(task);

        return {
            success: true,
            taskId: task.id,
            resolvedPrompt: result.resolvedPrompt,
        };
    }

    private buildTask(result: PromptExecutionResult, request: ExecutePromptRequest): OrchestratorTask {
        return {
            id: generateId(),
            description: 'Create Test Plans',
            input: result.resolvedPrompt,
            status: TaskStatus.PENDING,
            priority: 5,
            kanbanColumn: request.autoStart ? 'todo' : 'backlog',
            swimLaneId: request.swimLaneId,
            autoStart: request.autoStart,
            createdAt: Date.now(),
            tags: ['default-prompt', 'test-plans'],
        };
    }
}

export class AutoPassTestsHandler implements PromptHandler {
    readonly slug = 'auto-pass-tests';

    execute(request: ExecutePromptRequest, ctx: PromptExecutorContext): ExecutePromptResponse {
        const result = ctx.promptRegistry.resolvePrompt(this.slug, request.inputs);
        if (!result.success) {
            return {
                success: false,
                error: result.error,
                validationErrors: ctx.promptRegistry.validateInputs(this.slug, request.inputs),
            };
        }

        const task = this.buildTask(result, request);
        ctx.submitTask(task);
        ctx.saveTask(task);

        return {
            success: true,
            taskId: task.id,
            resolvedPrompt: result.resolvedPrompt,
        };
    }

    private buildTask(result: PromptExecutionResult, request: ExecutePromptRequest): OrchestratorTask {
        return {
            id: generateId(),
            description: 'Auto-Pass All Tests',
            input: result.resolvedPrompt,
            status: TaskStatus.PENDING,
            priority: 7,
            kanbanColumn: request.autoStart ? 'todo' : 'backlog',
            swimLaneId: request.swimLaneId,
            autoStart: request.autoStart,
            createdAt: Date.now(),
            tags: ['default-prompt', 'auto-pass-tests'],
        };
    }
}

export class InstallPluginsHandler implements PromptHandler {
    readonly slug = 'install-plugins';

    execute(request: ExecutePromptRequest, ctx: PromptExecutorContext): ExecutePromptResponse {
        const result = ctx.promptRegistry.resolvePrompt(this.slug, request.inputs);
        if (!result.success) {
            return {
                success: false,
                error: result.error,
                validationErrors: ctx.promptRegistry.validateInputs(this.slug, request.inputs),
            };
        }

        const task = this.buildTask(result, request);
        ctx.submitTask(task);
        ctx.saveTask(task);

        return {
            success: true,
            taskId: task.id,
            resolvedPrompt: result.resolvedPrompt,
        };
    }

    private buildTask(result: PromptExecutionResult, request: ExecutePromptRequest): OrchestratorTask {
        return {
            id: generateId(),
            description: 'Install Plugins',
            input: result.resolvedPrompt,
            status: TaskStatus.PENDING,
            priority: 5,
            kanbanColumn: request.autoStart ? 'todo' : 'backlog',
            swimLaneId: request.swimLaneId,
            autoStart: request.autoStart,
            createdAt: Date.now(),
            tags: ['default-prompt', 'install-plugins'],
        };
    }
}

// ─── PromptExecutor ─────────────────────────────────────────────────────────

export class PromptExecutor {

    private handlers: Map<string, PromptHandler> = new Map();

    constructor() {
        this.registerDefaultHandlers();
    }

    private registerDefaultHandlers(): void {
        const defaults: PromptHandler[] = [
            new CreateTestPlanHandler(),
            new AutoPassTestsHandler(),
            new InstallPluginsHandler(),
        ];
        for (const handler of defaults) {
            this.handlers.set(handler.slug, handler);
        }
    }

    /**
     * Register a custom prompt handler.
     */
    registerHandler(handler: PromptHandler): void {
        this.handlers.set(handler.slug, handler);
    }

    /**
     * Execute a prompt by slug with provided inputs.
     */
    execute(request: ExecutePromptRequest, ctx: PromptExecutorContext): ExecutePromptResponse {
        const handler = this.handlers.get(request.slug);
        if (!handler) {
            return {
                success: false,
                error: `No handler registered for prompt: ${request.slug}`,
            };
        }

        return handler.execute(request, ctx);
    }

    /**
     * Get all registered handler slugs.
     */
    getRegisteredSlugs(): string[] {
        return Array.from(this.handlers.keys());
    }

    /**
     * Check if a handler exists for the given slug.
     */
    hasHandler(slug: string): boolean {
        return this.handlers.has(slug);
    }
}
