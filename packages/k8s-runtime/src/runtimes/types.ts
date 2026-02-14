/**
 * Runtime abstraction interfaces for tmux-agents.
 *
 * All runtimes (local, SSH, Docker, K8s) use tmux as the execution abstraction.
 * The only difference is the exec prefix passed to TmuxService:
 * - local: ""
 * - ssh: "ssh host"
 * - docker: "docker exec <cid>"
 * - k8s: "kubectl exec <pod> -n <ns> --"
 */

import { TmuxService } from '../core/tmuxService.js';

// ─── Runtime Configuration ──────────────────────────────────────────────────

export interface RuntimeConfig {
	type: 'local' | 'ssh' | 'docker' | 'kubernetes';
	id: string;
	enabled: boolean;
	[key: string]: any; // Runtime-specific config
}

export interface DockerRuntimeConfig extends RuntimeConfig {
	type: 'docker';
	image: string;
	memory?: string;
	cpus?: string;
	workdir?: string;
	network?: string;
	extraBinds?: string[];
	env?: Record<string, string>;
}

export interface K8sRuntimeConfig extends RuntimeConfig {
	type: 'kubernetes';
	namespace: string;
	image: string;
	kubeconfig?: string;
	context?: string;
	cpu?: string;
	memory?: string;
	gpu?: boolean | number;
	storageClassName?: string;
	volumeSize?: string;
	nodeSelector?: Record<string, string>;
	tolerations?: Array<{
		key: string;
		operator: string;
		effect: string;
		value?: string;
	}>;
}

// ─── Agent Configuration ────────────────────────────────────────────────────

export interface AgentConfig {
	taskId: string;
	taskName: string;
	prompt: string;
	provider: string;
	providerCommand: string;
	launchDelay?: number;
	workingDirectory?: string;
	env?: Record<string, string>;
	resources?: {
		cpu?: string;
		memory?: string;
		gpu?: boolean | number;
	};
	labels?: Record<string, string>;
}

// ─── Agent Handle ───────────────────────────────────────────────────────────

export interface AgentHandle {
	runtimeId: string;
	agentId: string;
	taskId: string;
	createdAt: Date;

	// Runtime-specific identifiers
	containerId?: string;  // Docker
	podName?: string;      // K8s
	sessionId?: string;    // Local/SSH
}

// ─── Agent Info ─────────────────────────────────────────────────────────────

export interface AgentInfo {
	handle: AgentHandle;
	state: 'starting' | 'running' | 'completed' | 'failed' | 'killed';
	taskName: string;
	provider: string;
	createdAt: Date;
	completedAt?: Date;
	exitCode?: number;
	labels: Record<string, string>;
}

// ─── Runtime Info ───────────────────────────────────────────────────────────

export interface RuntimeInfo {
	id: string;
	type: string;
	config: RuntimeConfig;
	available: boolean;
	agentCount: number;
}

// ─── AgentRuntime Interface ─────────────────────────────────────────────────

export interface AgentRuntime {
	/**
	 * Runtime type identifier
	 */
	readonly type: string;

	/**
	 * Spawn a new agent with the given configuration.
	 *
	 * Flow:
	 * 1. Create execution environment (container/pod/session)
	 * 2. Wait for tmux to be ready
	 * 3. Launch AI CLI with provider command
	 * 4. Send task prompt
	 * 5. Return handle for future operations
	 */
	spawnAgent(config: AgentConfig): Promise<AgentHandle>;

	/**
	 * Kill a running agent and clean up resources.
	 */
	killAgent(handle: AgentHandle): Promise<void>;

	/**
	 * List all agents managed by this runtime.
	 */
	listAgents(): Promise<AgentInfo[]>;

	/**
	 * Get a TmuxService instance for interacting with the agent's tmux session.
	 *
	 * The returned TmuxService is pre-configured with the correct exec prefix
	 * (e.g., "docker exec <cid>" or "kubectl exec <pod> -n <ns> --").
	 */
	getTmux(handle: AgentHandle): TmuxService;

	/**
	 * Get the command a user would run to attach to this agent interactively.
	 *
	 * Examples:
	 * - local: "tmux attach -t agent"
	 * - docker: "docker exec -it <cid> tmux attach -t agent"
	 * - k8s: "kubectl exec -it <pod> -n <ns> -- tmux attach -t agent"
	 */
	getAttachCommand(handle: AgentHandle): string;

	/**
	 * Verify that the runtime is available and operational.
	 *
	 * Examples:
	 * - docker: ping Docker daemon
	 * - k8s: list pods in namespace
	 */
	ping(): Promise<void>;

	/**
	 * Reconcile running agents after daemon restart.
	 *
	 * Detects agents that were started by this daemon but are still running,
	 * and returns handles to reconnect to them.
	 */
	reconcile?(): Promise<AgentHandle[]>;
}
