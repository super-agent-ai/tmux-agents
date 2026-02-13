import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import Dockerode from 'dockerode';
import { TmuxService } from '../core/tmuxService';
import { EventBus } from '../core/eventBus';
import { ServerIdentity, AIProvider } from '../core/types';
import {
    AgentRuntime,
    AgentConfig,
    AgentHandle,
    AgentInfo,
    AgentStatus,
    DockerRuntimeOptions,
    DockerAgentHandle
} from './types';

// ─── Docker Runtime ───────────────────────────────────────────────────────

/**
 * DockerRuntime manages agents running in Docker containers.
 * Each agent runs in its own container with tmux pre-installed.
 */
export class DockerRuntime implements AgentRuntime {
    readonly type = 'docker';
    private docker: Dockerode;
    private readonly options: Required<DockerRuntimeOptions>;

    constructor(
        options: DockerRuntimeOptions = {},
        private readonly eventBus?: EventBus
    ) {
        // Initialize Docker client
        this.docker = new Dockerode({
            socketPath: options.socketPath || '/var/run/docker.sock'
        });

        // Set defaults
        this.options = {
            socketPath: options.socketPath || '/var/run/docker.sock',
            image: options.image || 'tmux-agents-base:latest',
            network: options.network || 'tmux-agents',
            extraBinds: options.extraBinds || [],
            defaultMemory: options.defaultMemory || 4 * 1024 * 1024 * 1024, // 4GB
            defaultCpus: options.defaultCpus || 2.0
        };
    }

    // ─── Agent Lifecycle ─────────────────────────────────────────────────

    async spawnAgent(config: AgentConfig): Promise<AgentHandle> {
        this.emitInfo(`Creating Docker container for agent ${config.agentId}`);

        try {
            // 1. Create container with tmux and resource limits
            const container = await this.createContainer(config);
            const containerId = container.id;

            // 2. Start container
            await container.start();
            this.emitInfo(`Container ${containerId.substring(0, 12)} started`);

            // 3. Wait for tmux to be ready
            await this.waitForTmux(containerId, config.sessionName);

            // 4. Get TmuxService for this container
            const tmux = this.getTmuxForContainer(containerId);

            // 5. Launch AI provider in tmux session
            await this.launchAIProvider(tmux, config);

            // 6. Create agent handle
            const handle: DockerAgentHandle = {
                runtimeType: 'docker',
                agentId: config.agentId,
                data: {
                    containerId,
                    sessionName: config.sessionName
                }
            };

            this.emitInfo(`Agent ${config.agentId} spawned in container ${containerId.substring(0, 12)}`);
            return handle;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emitError(`Failed to spawn agent ${config.agentId}: ${errorMessage}`);
            throw error;
        }
    }

    async killAgent(handle: AgentHandle): Promise<void> {
        const dockerHandle = handle as DockerAgentHandle;
        const containerId = dockerHandle.data.containerId;

        this.emitInfo(`Stopping container ${containerId.substring(0, 12)}`);

        try {
            const container = this.docker.getContainer(containerId);

            // Stop container (graceful shutdown with 10s timeout)
            await container.stop({ t: 10 }).catch((err) => {
                // Ignore errors if container is already stopped
                if (!err.message.includes('is not running')) {
                    throw err;
                }
            });

            // Remove container
            await container.remove();

            this.emitInfo(`Container ${containerId.substring(0, 12)} removed`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emitError(`Failed to kill agent ${handle.agentId}: ${errorMessage}`);
            throw error;
        }
    }

    async listAgents(): Promise<AgentInfo[]> {
        try {
            // List all containers with our label
            const containers = await this.docker.listContainers({
                all: true,
                filters: {
                    label: ['tmux-agents=true']
                }
            });

            const agents: AgentInfo[] = [];

            for (const containerInfo of containers) {
                const labels = containerInfo.Labels || {};
                const agentId = labels['tmux-agents.agent-id'];
                const sessionName = labels['tmux-agents.session-name'];

                if (!agentId || !sessionName) {
                    continue;
                }

                // Determine status from container state
                let status: AgentStatus;
                switch (containerInfo.State) {
                    case 'running':
                        status = AgentStatus.RUNNING;
                        break;
                    case 'exited':
                    case 'dead':
                        status = AgentStatus.STOPPED;
                        break;
                    case 'created':
                    case 'restarting':
                        status = AgentStatus.STARTING;
                        break;
                    default:
                        status = AgentStatus.FAILED;
                }

                const handle: DockerAgentHandle = {
                    runtimeType: 'docker',
                    agentId,
                    data: {
                        containerId: containerInfo.Id,
                        sessionName
                    }
                };

                agents.push({
                    handle,
                    // We don't have full config stored, so create a minimal one
                    config: {
                        agentId,
                        aiProvider: labels['tmux-agents.ai-provider'] as any || 'claude',
                        task: '',
                        workingDirectory: '/workspace',
                        sessionName
                    },
                    status,
                    createdAt: containerInfo.Created * 1000,
                    lastActivityAt: Date.now() // We don't track this in labels
                });
            }

            return agents;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emitError(`Failed to list agents: ${errorMessage}`);
            throw error;
        }
    }

    getTmux(handle: AgentHandle): TmuxService {
        const dockerHandle = handle as DockerAgentHandle;
        return this.getTmuxForContainer(dockerHandle.data.containerId);
    }

    getAttachCommand(handle: AgentHandle): string {
        const dockerHandle = handle as DockerAgentHandle;
        const containerId = dockerHandle.data.containerId;
        const sessionName = dockerHandle.data.sessionName;
        return `docker exec -it ${containerId} tmux attach -t ${sessionName}`;
    }

    async ping(): Promise<void> {
        try {
            await this.docker.ping();
        } catch (error) {
            throw new Error(`Docker daemon is not reachable: ${error}`);
        }
    }

    // ─── Container Management ────────────────────────────────────────────

    private async createContainer(config: AgentConfig): Promise<Dockerode.Container> {
        // Build environment variables
        const env = this.buildEnv(config);

        // Build volume mounts
        const binds = this.buildBinds(config);

        // Build resource limits
        const memory = config.resources?.memory || this.options.defaultMemory;
        const cpus = config.resources?.cpus || this.options.defaultCpus;

        // Build labels for agent metadata
        const labels = {
            'tmux-agents': 'true',
            'tmux-agents.agent-id': config.agentId,
            'tmux-agents.session-name': config.sessionName,
            'tmux-agents.ai-provider': config.aiProvider,
            'tmux-agents.created-at': Date.now().toString()
        };

        // Create container
        const container = await this.docker.createContainer({
            Image: this.options.image,
            name: `tmux-agent-${config.agentId}`,
            Labels: labels,
            Env: env,
            HostConfig: {
                Binds: binds,
                Memory: memory,
                NanoCpus: cpus * 1e9, // Convert to nanocpus
                NetworkMode: this.options.network,
                AutoRemove: false // We'll remove manually after stop
            },
            WorkingDir: '/workspace'
        });

        return container;
    }

    private buildEnv(config: AgentConfig): string[] {
        const env: string[] = [];

        // Add user-provided environment variables
        if (config.env) {
            for (const [key, value] of Object.entries(config.env)) {
                env.push(`${key}=${value}`);
            }
        }

        return env;
    }

    private buildBinds(config: AgentConfig): string[] {
        const binds: string[] = [];

        // Mount working directory
        binds.push(`${config.workingDirectory}:/workspace:rw`);

        // Add auth token binds
        binds.push(...this.getAuthBinds());

        // Add user-provided extra binds
        binds.push(...this.options.extraBinds);

        return binds;
    }

    /**
     * Automatically mount AI CLI auth tokens and config directories.
     */
    private getAuthBinds(): string[] {
        const binds: string[] = [];
        const home = os.homedir();

        // Claude CLI config
        const claudeConfig = path.join(home, '.config', 'claude');
        if (fs.existsSync(claudeConfig)) {
            binds.push(`${claudeConfig}:/root/.config/claude:ro`);
        }

        // Google Cloud SDK (for Gemini)
        const gcloudConfig = path.join(home, '.config', 'gcloud');
        if (fs.existsSync(gcloudConfig)) {
            binds.push(`${gcloudConfig}:/root/.config/gcloud:ro`);
        }

        // Git config
        const gitconfig = path.join(home, '.gitconfig');
        if (fs.existsSync(gitconfig)) {
            binds.push(`${gitconfig}:/root/.gitconfig:ro`);
        }

        // SSH keys (for git operations)
        const sshDir = path.join(home, '.ssh');
        if (fs.existsSync(sshDir)) {
            binds.push(`${sshDir}:/root/.ssh:ro`);
        }

        // Aider config
        const aiderConfig = path.join(home, '.aider');
        if (fs.existsSync(aiderConfig)) {
            binds.push(`${aiderConfig}:/root/.aider:ro`);
        }

        return binds;
    }

    /**
     * Wait for tmux to be ready in the container.
     * The container's entrypoint creates a tmux session automatically.
     */
    private async waitForTmux(containerId: string, sessionName: string): Promise<void> {
        const maxRetries = 30; // 30 seconds max
        const retryDelay = 1000; // 1 second

        for (let i = 0; i < maxRetries; i++) {
            try {
                const tmux = this.getTmuxForContainer(containerId);
                const sessions = await tmux.getSessions();

                // Check if the 'agent' session exists (created by entrypoint)
                if (sessions.includes('agent')) {
                    return;
                }
            } catch (error) {
                // Ignore errors and retry
            }

            await this.sleep(retryDelay);
        }

        throw new Error(`Tmux session did not become ready in container ${containerId.substring(0, 12)}`);
    }

    /**
     * Launch the AI provider CLI in the tmux session.
     */
    private async launchAIProvider(tmux: TmuxService, config: AgentConfig): Promise<void> {
        // Get AI provider command from config (simplified - should use AIAssistantManager)
        const providerCommand = this.getProviderCommand(config);

        // Send the AI command to the session
        await tmux.sendKeysToSession(config.sessionName, providerCommand);

        // Wait for CLI to launch
        const launchDelay = config.launchDelayMs || 3000;
        await this.sleep(launchDelay);

        // Send the task prompt
        if (config.task) {
            await tmux.pasteText(config.sessionName, '0', '0', config.task);
        }

        this.emitInfo(`AI provider launched in container for agent ${config.agentId}`);
    }

    /**
     * Get the command to launch the AI provider.
     * This is a simplified version - should integrate with AIAssistantManager.
     */
    private getProviderCommand(config: AgentConfig): string {
        // Basic command construction
        let cmd: string = config.aiProvider;

        if (config.aiModel) {
            cmd += ` --model ${config.aiModel}`;
        }

        if (config.autoPilot) {
            // Add auto-pilot flags (simplified)
            switch (config.aiProvider) {
                case AIProvider.CLAUDE:
                    cmd += ' --dangerously-skip-permissions';
                    break;
                case AIProvider.GEMINI:
                    cmd += ' --yolo';
                    break;
            }
        }

        return cmd;
    }

    /**
     * Create a TmuxService that executes commands in a Docker container.
     */
    private getTmuxForContainer(containerId: string): TmuxService {
        // Create a ServerIdentity for this container
        const serverIdentity: ServerIdentity = {
            id: `docker:${containerId}`,
            label: `Docker:${containerId.substring(0, 12)}`,
            isLocal: false
        };

        // The execPrefix tells TmuxService to prepend "docker exec <id>" to all commands
        const execPrefix = `docker exec ${containerId}`;

        return new TmuxService(serverIdentity, execPrefix, this.eventBus);
    }

    // ─── Network Management ──────────────────────────────────────────────

    /**
     * Ensure the Docker network exists for inter-container communication.
     */
    async ensureNetwork(): Promise<void> {
        try {
            const networks = await this.docker.listNetworks({
                filters: {
                    name: [this.options.network]
                }
            });

            if (networks.length === 0) {
                await this.docker.createNetwork({
                    Name: this.options.network,
                    Driver: 'bridge'
                });
                this.emitInfo(`Created Docker network: ${this.options.network}`);
            }
        } catch (error) {
            this.emitWarning(`Failed to ensure Docker network: ${error}`);
        }
    }

    // ─── Utilities ───────────────────────────────────────────────────────

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
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
