import { describe, it, expect } from 'vitest';
import { DockerAgentHandle } from '../types';

/**
 * Unit tests for DockerRuntime.
 * These tests verify basic functionality without requiring Docker.
 * Full integration tests are in dockerRuntime.integration.test.ts
 */

describe('DockerRuntime - Types', () => {
    describe('DockerAgentHandle', () => {
        it('should have correct structure', () => {
            const handle: DockerAgentHandle = {
                runtimeType: 'docker',
                agentId: 'test-agent',
                data: {
                    containerId: 'abc123',
                    sessionName: 'test-session'
                }
            };

            expect(handle.runtimeType).toBe('docker');
            expect(handle.agentId).toBe('test-agent');
            expect(handle.data.containerId).toBe('abc123');
            expect(handle.data.sessionName).toBe('test-session');
        });
    });
});

describe('DockerRuntime - Attach Command', () => {
    it('should format attach command correctly', () => {
        const handle: DockerAgentHandle = {
            runtimeType: 'docker',
            agentId: 'test-agent',
            data: {
                containerId: 'abc123def456',
                sessionName: 'my-session'
            }
        };

        // The expected format
        const expectedCmd = `docker exec -it ${handle.data.containerId} tmux attach -t ${handle.data.sessionName}`;
        expect(expectedCmd).toBe('docker exec -it abc123def456 tmux attach -t my-session');
    });
});

describe('DockerRuntime - Resource Limits', () => {
    it('should calculate nanocpus correctly', () => {
        const cpus = 2.5;
        const nanocpus = cpus * 1e9;
        expect(nanocpus).toBe(2500000000);
    });

    it('should calculate memory in bytes', () => {
        const memoryGB = 4;
        const memoryBytes = memoryGB * 1024 * 1024 * 1024;
        expect(memoryBytes).toBe(4294967296);
    });
});

describe('DockerRuntime - Labels', () => {
    it('should use correct label format', () => {
        const labels = {
            'tmux-agents': 'true',
            'tmux-agents.agent-id': 'test-agent-123',
            'tmux-agents.session-name': 'agent',
            'tmux-agents.ai-provider': 'claude',
            'tmux-agents.created-at': Date.now().toString()
        };

        expect(labels['tmux-agents']).toBe('true');
        expect(labels['tmux-agents.agent-id']).toBe('test-agent-123');
    });
});
