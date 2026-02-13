import { TmuxService } from '../core/tmuxService';
import { AIProvider } from '../core/types';

// ─── Agent Runtime Interface ──────────────────────────────────────────────

/**
 * AgentRuntime provides a pluggable execution backend for agents.
 * Implementations include: LocalRuntime (tmux on SSH), DockerRuntime, K8sRuntime
 */
export interface AgentRuntime {
    /** Runtime type identifier (e.g., 'local', 'docker', 'k8s') */
    type: string;

    /**
     * Spawn a new agent instance with the given configuration.
     * Returns a handle that uniquely identifies the agent.
     */
    spawnAgent(config: AgentConfig): Promise<AgentHandle>;

    /**
     * Terminate and cleanup an agent instance.
     */
    killAgent(handle: AgentHandle): Promise<void>;

    /**
     * List all agents managed by this runtime.
     */
    listAgents(): Promise<AgentInfo[]>;

    /**
     * Get a TmuxService instance for interacting with the agent's tmux session.
     */
    getTmux(handle: AgentHandle): TmuxService;

    /**
     * Get a human-readable command for attaching to the agent's session.
     * Used for opening interactive terminals in VS Code.
     */
    getAttachCommand(handle: AgentHandle): string;

    /**
     * Health check: verify the runtime is accessible.
     * Throws if the runtime is unreachable.
     */
    ping(): Promise<void>;
}

// ─── Agent Configuration ──────────────────────────────────────────────────

export interface AgentConfig {
    /** Unique agent identifier */
    agentId: string;

    /** AI provider to launch (claude, gemini, etc.) */
    aiProvider: AIProvider;

    /** Optional AI model override */
    aiModel?: string;

    /** Task description/prompt to send to the agent */
    task: string;

    /** Working directory for the agent */
    workingDirectory: string;

    /** Environment variables */
    env?: Record<string, string>;

    /** Session name for tmux */
    sessionName: string;

    /** Resource limits (optional) */
    resources?: ResourceLimits;

    /** Auto-pilot mode flags */
    autoPilot?: boolean;

    /** Launch delay in milliseconds (time to wait for CLI to start) */
    launchDelayMs?: number;
}

export interface ResourceLimits {
    /** Memory limit in bytes (e.g., 4 * 1024 * 1024 * 1024 for 4GB) */
    memory?: number;

    /** CPU limit (e.g., 2.0 for 2 CPUs) */
    cpus?: number;
}

// ─── Agent Handle ─────────────────────────────────────────────────────────

/**
 * AgentHandle is an opaque identifier returned by spawnAgent.
 * The structure varies by runtime type.
 */
export interface AgentHandle {
    /** Runtime type that created this handle */
    runtimeType: string;

    /** Unique agent ID */
    agentId: string;

    /** Runtime-specific data */
    data: Record<string, any>;
}

// ─── Agent Info ───────────────────────────────────────────────────────────

export interface AgentInfo {
    handle: AgentHandle;
    config: AgentConfig;
    status: AgentStatus;
    createdAt: number;
    lastActivityAt: number;
}

export enum AgentStatus {
    STARTING = 'starting',
    RUNNING = 'running',
    STOPPED = 'stopped',
    FAILED = 'failed'
}

// ─── Runtime Configuration ────────────────────────────────────────────────

/**
 * RuntimeConfig describes how to connect to and configure a runtime.
 */
export interface RuntimeConfig {
    /** Runtime type (local, docker, k8s) */
    type: string;

    /** Display name */
    label: string;

    /** Runtime-specific options */
    options: Record<string, any>;
}

// ─── Docker-Specific Types ────────────────────────────────────────────────

export interface DockerRuntimeOptions {
    /** Docker socket path (defaults to /var/run/docker.sock) */
    socketPath?: string;

    /** Docker image for agent containers */
    image?: string;

    /** Docker network for inter-container communication */
    network?: string;

    /** Additional volume mounts (host:container:mode) */
    extraBinds?: string[];

    /** Resource limits */
    defaultMemory?: number;
    defaultCpus?: number;
}

export interface DockerAgentHandle extends AgentHandle {
    runtimeType: 'docker';
    data: {
        containerId: string;
        sessionName: string;
    };
}

// ─── K8s-Specific Types ───────────────────────────────────────────────────

export interface K8sRuntimeOptions {
    /** Kubernetes context name */
    context?: string;

    /** Namespace for agent pods */
    namespace?: string;

    /** Pod image */
    image?: string;

    /** Resource limits */
    defaultMemory?: string;
    defaultCpus?: string;
}

export interface K8sAgentHandle extends AgentHandle {
    runtimeType: 'k8s';
    data: {
        podName: string;
        namespace: string;
        sessionName: string;
    };
}
