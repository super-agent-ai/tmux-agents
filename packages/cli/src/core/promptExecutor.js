"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptExecutor = exports.InstallPluginsHandler = exports.AutoPassTestsHandler = exports.CreateTestPlanHandler = void 0;
const types_1 = require("./types");
// ─── Concrete Handlers ──────────────────────────────────────────────────────
function generateId() {
    return 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
class CreateTestPlanHandler {
    constructor() {
        this.slug = 'create-test-plans';
    }
    execute(request, ctx) {
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
    buildTask(result, request) {
        return {
            id: generateId(),
            description: 'Create Test Plans',
            input: result.resolvedPrompt,
            status: types_1.TaskStatus.PENDING,
            priority: 5,
            kanbanColumn: request.autoStart ? 'todo' : 'backlog',
            swimLaneId: request.swimLaneId,
            autoStart: request.autoStart,
            createdAt: Date.now(),
            tags: ['default-prompt', 'test-plans'],
        };
    }
}
exports.CreateTestPlanHandler = CreateTestPlanHandler;
class AutoPassTestsHandler {
    constructor() {
        this.slug = 'auto-pass-tests';
    }
    execute(request, ctx) {
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
    buildTask(result, request) {
        return {
            id: generateId(),
            description: 'Auto-Pass All Tests',
            input: result.resolvedPrompt,
            status: types_1.TaskStatus.PENDING,
            priority: 7,
            kanbanColumn: request.autoStart ? 'todo' : 'backlog',
            swimLaneId: request.swimLaneId,
            autoStart: request.autoStart,
            createdAt: Date.now(),
            tags: ['default-prompt', 'auto-pass-tests'],
        };
    }
}
exports.AutoPassTestsHandler = AutoPassTestsHandler;
class InstallPluginsHandler {
    constructor() {
        this.slug = 'install-plugins';
    }
    execute(request, ctx) {
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
    buildTask(result, request) {
        return {
            id: generateId(),
            description: 'Install Plugins',
            input: result.resolvedPrompt,
            status: types_1.TaskStatus.PENDING,
            priority: 5,
            kanbanColumn: request.autoStart ? 'todo' : 'backlog',
            swimLaneId: request.swimLaneId,
            autoStart: request.autoStart,
            createdAt: Date.now(),
            tags: ['default-prompt', 'install-plugins'],
        };
    }
}
exports.InstallPluginsHandler = InstallPluginsHandler;
// ─── PromptExecutor ─────────────────────────────────────────────────────────
class PromptExecutor {
    constructor() {
        this.handlers = new Map();
        this.registerDefaultHandlers();
    }
    registerDefaultHandlers() {
        const defaults = [
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
    registerHandler(handler) {
        this.handlers.set(handler.slug, handler);
    }
    /**
     * Execute a prompt by slug with provided inputs.
     */
    execute(request, ctx) {
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
    getRegisteredSlugs() {
        return Array.from(this.handlers.keys());
    }
    /**
     * Check if a handler exists for the given slug.
     */
    hasHandler(slug) {
        return this.handlers.has(slug);
    }
}
exports.PromptExecutor = PromptExecutor;
//# sourceMappingURL=promptExecutor.js.map