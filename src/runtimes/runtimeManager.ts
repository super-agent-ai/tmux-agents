import { TmuxService } from '../core/tmuxService';
import { EventBus } from '../core/eventBus';
import {
    AgentRuntime,
    RuntimeConfig,
    AgentConfig,
    AgentHandle,
    AgentInfo
} from './types';

// ─── Runtime Manager ──────────────────────────────────────────────────────

/**
 * RuntimeManager is the central registry for all runtime backends.
 * It routes agent operations to the appropriate runtime implementation.
 */
export class RuntimeManager {
    private runtimes = new Map<string, AgentRuntime>();

    constructor(private readonly eventBus?: EventBus) {}

    // ─── Registration ────────────────────────────────────────────────────

    /**
     * Register a runtime implementation with a unique ID.
     */
    register(id: string, runtime: AgentRuntime): void {
        if (this.runtimes.has(id)) {
            throw new Error(`Runtime with id "${id}" is already registered`);
        }
        this.runtimes.set(id, runtime);
        this.emitInfo(`Runtime registered: ${id} (type: ${runtime.type})`);
    }

    /**
     * Unregister a runtime by ID.
     */
    unregister(id: string): void {
        if (!this.runtimes.has(id)) {
            throw new Error(`Runtime with id "${id}" is not registered`);
        }
        this.runtimes.delete(id);
        this.emitInfo(`Runtime unregistered: ${id}`);
    }

    /**
     * Get a runtime by ID.
     */
    getRuntime(id: string): AgentRuntime {
        const runtime = this.runtimes.get(id);
        if (!runtime) {
            throw new Error(`Runtime with id "${id}" not found`);
        }
        return runtime;
    }

    /**
     * List all registered runtimes.
     */
    listRuntimes(): RuntimeInfo[] {
        return Array.from(this.runtimes.entries()).map(([id, runtime]) => ({
            id,
            type: runtime.type
        }));
    }

    // ─── Agent Operations ────────────────────────────────────────────────

    /**
     * Spawn an agent on the specified runtime.
     */
    async spawnAgent(runtimeId: string, config: AgentConfig): Promise<AgentHandle> {
        const runtime = this.getRuntime(runtimeId);
        this.emitInfo(`Spawning agent ${config.agentId} on runtime ${runtimeId}`);
        try {
            const handle = await runtime.spawnAgent(config);
            this.emitInfo(`Agent ${config.agentId} spawned successfully on ${runtimeId}`);
            return handle;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emitError(`Failed to spawn agent ${config.agentId} on ${runtimeId}: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Kill an agent by handle.
     */
    async killAgent(handle: AgentHandle): Promise<void> {
        const runtime = this.getRuntime(this.extractRuntimeId(handle));
        this.emitInfo(`Killing agent ${handle.agentId}`);
        try {
            await runtime.killAgent(handle);
            this.emitInfo(`Agent ${handle.agentId} terminated successfully`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emitError(`Failed to kill agent ${handle.agentId}: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * List all agents across all runtimes.
     */
    async listAllAgents(): Promise<AgentInfo[]> {
        const allAgents: AgentInfo[] = [];
        for (const [id, runtime] of this.runtimes.entries()) {
            try {
                const agents = await runtime.listAgents();
                allAgents.push(...agents);
            } catch (error) {
                this.emitWarning(`Failed to list agents from runtime ${id}: ${error}`);
            }
        }
        return allAgents;
    }

    /**
     * Get a TmuxService for interacting with an agent's session.
     */
    getTmux(handle: AgentHandle): TmuxService {
        const runtime = this.getRuntime(this.extractRuntimeId(handle));
        return runtime.getTmux(handle);
    }

    /**
     * Get the attach command for an agent.
     */
    getAttachCommand(handle: AgentHandle): string {
        const runtime = this.getRuntime(this.extractRuntimeId(handle));
        return runtime.getAttachCommand(handle);
    }

    /**
     * Health check for a specific runtime.
     */
    async ping(runtimeId: string): Promise<void> {
        const runtime = this.getRuntime(runtimeId);
        await runtime.ping();
    }

    /**
     * Health check all runtimes.
     */
    async pingAll(): Promise<Map<string, boolean>> {
        const results = new Map<string, boolean>();
        for (const [id, runtime] of this.runtimes.entries()) {
            try {
                await runtime.ping();
                results.set(id, true);
            } catch {
                results.set(id, false);
            }
        }
        return results;
    }

    // ─── Utilities ───────────────────────────────────────────────────────

    /**
     * Extract the runtime ID from an agent handle.
     * For now, we use a simple prefix format: "runtimeId:agentId"
     */
    private extractRuntimeId(handle: AgentHandle): string {
        // Check if runtime ID is stored in handle data
        if (handle.data.runtimeId) {
            return handle.data.runtimeId;
        }

        // For Docker handles, we can infer from the container ID
        if (handle.runtimeType === 'docker') {
            // Assuming we registered Docker runtime with a known ID
            return 'docker-default';
        }

        // For K8s handles
        if (handle.runtimeType === 'k8s') {
            return 'k8s-default';
        }

        // For local runtime
        if (handle.runtimeType === 'local') {
            return 'local-default';
        }

        throw new Error(`Unable to determine runtime ID for handle type: ${handle.runtimeType}`);
    }

    // ─── Event Emitters ──────────────────────────────────────────────────

    private emitInfo(message: string): void {
        if (this.eventBus) {
            this.eventBus.emit('info', message);
        }
    }

    private emitWarning(message: string): void {
        if (this.eventBus) {
            this.eventBus.emit('warning', message);
        }
    }

    private emitError(message: string): void {
        if (this.eventBus) {
            this.eventBus.emit('error', message);
        }
    }
}

// ─── Helper Types ─────────────────────────────────────────────────────────

export interface RuntimeInfo {
    id: string;
    type: string;
}
