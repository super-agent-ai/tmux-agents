import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DockerRuntime } from '../dockerRuntime';
import { AgentConfig } from '../types';
import { AIProvider } from '../../core/types';
import Dockerode from 'dockerode';

/**
 * Integration tests for DockerRuntime.
 * These tests require a running Docker daemon and the tmux-agents-base image.
 *
 * Run: npm run test:integration
 *
 * Prerequisites:
 * 1. Docker daemon running
 * 2. tmux-agents-base:latest image built (cd docker && docker build -t tmux-agents-base:latest .)
 */

describe('DockerRuntime Integration', () => {
    let runtime: DockerRuntime;
    let docker: Dockerode;
    const spawnedContainers: string[] = [];

    beforeAll(async () => {
        // Check Docker availability
        docker = new Dockerode();
        try {
            await docker.ping();
        } catch (error) {
            console.error('Docker daemon is not running. Skipping integration tests.');
            return;
        }

        // Check if image exists
        const images = await docker.listImages({
            filters: {
                reference: ['tmux-agents-base:latest']
            }
        });

        if (images.length === 0) {
            console.error('tmux-agents-base:latest image not found. Please build it first:');
            console.error('  cd docker && docker build -t tmux-agents-base:latest .');
            return;
        }

        runtime = new DockerRuntime({
            image: 'tmux-agents-base:latest',
            network: 'tmux-agents-test'
        });

        // Ensure network exists
        await runtime.ensureNetwork();
    });

    afterAll(async () => {
        // Cleanup: remove all spawned containers
        for (const containerId of spawnedContainers) {
            try {
                const container = docker.getContainer(containerId);
                await container.stop({ t: 1 }).catch(() => {});
                await container.remove().catch(() => {});
            } catch (error) {
                // Ignore errors
            }
        }

        // Remove test network
        try {
            const network = docker.getNetwork('tmux-agents-test');
            await network.remove();
        } catch (error) {
            // Ignore errors
        }
    });

    beforeEach(() => {
        // Clear the list before each test
        spawnedContainers.length = 0;
    });

    it('should ping Docker daemon', async () => {
        await expect(runtime.ping()).resolves.toBeUndefined();
    });

    it('should spawn an agent in a container', async () => {
        const config: AgentConfig = {
            agentId: 'test-agent-1',
            aiProvider: AIProvider.CLAUDE,
            task: 'echo "Hello from container"',
            workingDirectory: process.cwd(),
            sessionName: 'agent',
            launchDelayMs: 100 // Short delay for testing
        };

        const handle = await runtime.spawnAgent(config);
        spawnedContainers.push(handle.data.containerId);

        expect(handle.runtimeType).toBe('docker');
        expect(handle.agentId).toBe('test-agent-1');
        expect(handle.data.containerId).toBeDefined();
        expect(handle.data.sessionName).toBe('agent');

        // Verify container is running
        const container = docker.getContainer(handle.data.containerId);
        const info = await container.inspect();
        expect(info.State.Running).toBe(true);
    }, 30000); // 30 second timeout

    it('should list spawned agents', async () => {
        const config: AgentConfig = {
            agentId: 'test-agent-2',
            aiProvider: AIProvider.GEMINI,
            task: 'echo "Test"',
            workingDirectory: process.cwd(),
            sessionName: 'agent',
            launchDelayMs: 100
        };

        const handle = await runtime.spawnAgent(config);
        spawnedContainers.push(handle.data.containerId);

        const agents = await runtime.listAgents();
        const found = agents.find(a => a.handle.agentId === 'test-agent-2');

        expect(found).toBeDefined();
        expect(found?.config.aiProvider).toBe(AIProvider.GEMINI);
        expect(found?.status).toBe('running');
    }, 30000);

    it('should kill an agent', async () => {
        const config: AgentConfig = {
            agentId: 'test-agent-3',
            aiProvider: AIProvider.CLAUDE,
            task: 'echo "Kill test"',
            workingDirectory: process.cwd(),
            sessionName: 'agent',
            launchDelayMs: 100
        };

        const handle = await runtime.spawnAgent(config);
        const containerId = handle.data.containerId;
        spawnedContainers.push(containerId);

        // Kill the agent
        await runtime.killAgent(handle);

        // Verify container is removed
        try {
            const container = docker.getContainer(containerId);
            await container.inspect();
            // If we get here, container still exists (should not happen)
            expect(false).toBe(true);
        } catch (error: any) {
            // Container should not exist (404 error)
            expect(error.statusCode).toBe(404);
        }

        // Remove from cleanup list since it's already gone
        const index = spawnedContainers.indexOf(containerId);
        if (index > -1) {
            spawnedContainers.splice(index, 1);
        }
    }, 30000);

    it('should get TmuxService for container', async () => {
        const config: AgentConfig = {
            agentId: 'test-agent-4',
            aiProvider: AIProvider.CLAUDE,
            task: 'echo "Tmux test"',
            workingDirectory: process.cwd(),
            sessionName: 'agent',
            launchDelayMs: 100
        };

        const handle = await runtime.spawnAgent(config);
        spawnedContainers.push(handle.data.containerId);

        const tmux = runtime.getTmux(handle);
        expect(tmux).toBeDefined();

        // Test tmux operations
        const sessions = await tmux.getSessions();
        expect(sessions).toContain('agent');
    }, 30000);

    it('should apply resource limits', async () => {
        const config: AgentConfig = {
            agentId: 'test-agent-5',
            aiProvider: AIProvider.CLAUDE,
            task: 'echo "Resource test"',
            workingDirectory: process.cwd(),
            sessionName: 'agent',
            resources: {
                memory: 2 * 1024 * 1024 * 1024, // 2GB
                cpus: 1.0
            },
            launchDelayMs: 100
        };

        const handle = await runtime.spawnAgent(config);
        spawnedContainers.push(handle.data.containerId);

        // Inspect container to verify resource limits
        const container = docker.getContainer(handle.data.containerId);
        const info = await container.inspect();

        expect(info.HostConfig.Memory).toBe(2 * 1024 * 1024 * 1024);
        expect(info.HostConfig.NanoCpus).toBe(1.0 * 1e9);
    }, 30000);

    it('should mount working directory', async () => {
        const config: AgentConfig = {
            agentId: 'test-agent-6',
            aiProvider: AIProvider.CLAUDE,
            task: 'ls -la /workspace',
            workingDirectory: process.cwd(),
            sessionName: 'agent',
            launchDelayMs: 100
        };

        const handle = await runtime.spawnAgent(config);
        spawnedContainers.push(handle.data.containerId);

        // Inspect container to verify mounts
        const container = docker.getContainer(handle.data.containerId);
        const info = await container.inspect();

        const workspaceMount = info.Mounts?.find(m => m.Destination === '/workspace');
        expect(workspaceMount).toBeDefined();
        expect(workspaceMount?.Source).toBe(process.cwd());
    }, 30000);

    it('should reconnect to existing containers after restart', async () => {
        // Simulate daemon restart by creating a new runtime instance
        const config: AgentConfig = {
            agentId: 'test-agent-7',
            aiProvider: AIProvider.CLAUDE,
            task: 'sleep 60',
            workingDirectory: process.cwd(),
            sessionName: 'agent',
            launchDelayMs: 100
        };

        const handle = await runtime.spawnAgent(config);
        spawnedContainers.push(handle.data.containerId);

        // Create a new runtime instance (simulating restart)
        const newRuntime = new DockerRuntime({
            image: 'tmux-agents-base:latest',
            network: 'tmux-agents-test'
        });

        // List agents should find the previously spawned agent
        const agents = await newRuntime.listAgents();
        const found = agents.find(a => a.handle.agentId === 'test-agent-7');

        expect(found).toBeDefined();
        expect(found?.handle.data.containerId).toBe(handle.data.containerId);
    }, 30000);
});

describe('DockerRuntime - Error Handling', () => {
    it('should handle missing Docker daemon gracefully', async () => {
        // Use invalid socket path
        const runtime = new DockerRuntime({
            socketPath: '/invalid/docker.sock'
        });

        await expect(runtime.ping()).rejects.toThrow();
    });

    it('should handle missing image gracefully', async () => {
        const runtime = new DockerRuntime({
            image: 'non-existent-image:latest'
        });

        const config: AgentConfig = {
            agentId: 'test-agent-fail',
            aiProvider: AIProvider.CLAUDE,
            task: 'echo "Test"',
            workingDirectory: process.cwd(),
            sessionName: 'agent'
        };

        await expect(runtime.spawnAgent(config)).rejects.toThrow();
    });
});
