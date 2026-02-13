import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RuntimeManager } from '../runtimeManager';
import { AgentRuntime, AgentConfig, AgentHandle, AgentInfo, AgentStatus } from '../types';
import { TmuxService } from '../../core/tmuxService';

describe('RuntimeManager', () => {
    let manager: RuntimeManager;
    let mockRuntime: AgentRuntime;

    beforeEach(() => {
        manager = new RuntimeManager();

        // Create a mock runtime
        mockRuntime = {
            type: 'mock',
            spawnAgent: vi.fn().mockResolvedValue({
                runtimeType: 'mock',
                agentId: 'test-agent',
                data: {}
            }),
            killAgent: vi.fn().mockResolvedValue(undefined),
            listAgents: vi.fn().mockResolvedValue([]),
            getTmux: vi.fn().mockReturnValue({} as TmuxService),
            getAttachCommand: vi.fn().mockReturnValue('mock attach'),
            ping: vi.fn().mockResolvedValue(undefined)
        };
    });

    describe('register', () => {
        it('should register a runtime', () => {
            manager.register('test-runtime', mockRuntime);
            const runtimes = manager.listRuntimes();
            expect(runtimes).toHaveLength(1);
            expect(runtimes[0]).toEqual({ id: 'test-runtime', type: 'mock' });
        });

        it('should throw if registering duplicate ID', () => {
            manager.register('test-runtime', mockRuntime);
            expect(() => manager.register('test-runtime', mockRuntime))
                .toThrow('already registered');
        });
    });

    describe('unregister', () => {
        it('should unregister a runtime', () => {
            manager.register('test-runtime', mockRuntime);
            manager.unregister('test-runtime');
            expect(manager.listRuntimes()).toHaveLength(0);
        });

        it('should throw if unregistering non-existent runtime', () => {
            expect(() => manager.unregister('non-existent'))
                .toThrow('not registered');
        });
    });

    describe('getRuntime', () => {
        it('should get a registered runtime', () => {
            manager.register('test-runtime', mockRuntime);
            const runtime = manager.getRuntime('test-runtime');
            expect(runtime).toBe(mockRuntime);
        });

        it('should throw if getting non-existent runtime', () => {
            expect(() => manager.getRuntime('non-existent'))
                .toThrow('not found');
        });
    });

    describe('spawnAgent', () => {
        it('should spawn an agent on the specified runtime', async () => {
            manager.register('test-runtime', mockRuntime);

            const config: AgentConfig = {
                agentId: 'test-agent',
                aiProvider: 'claude' as any,
                task: 'Test task',
                workingDirectory: '/tmp',
                sessionName: 'test-session'
            };

            const handle = await manager.spawnAgent('test-runtime', config);

            expect(mockRuntime.spawnAgent).toHaveBeenCalledWith(config);
            expect(handle.agentId).toBe('test-agent');
        });

        it('should throw if runtime not found', async () => {
            const config: AgentConfig = {
                agentId: 'test-agent',
                aiProvider: 'claude' as any,
                task: 'Test task',
                workingDirectory: '/tmp',
                sessionName: 'test-session'
            };

            await expect(manager.spawnAgent('non-existent', config))
                .rejects.toThrow('not found');
        });
    });

    describe('killAgent', () => {
        it('should kill an agent', async () => {
            manager.register('test-runtime', mockRuntime);

            const handle: AgentHandle = {
                runtimeType: 'mock',
                agentId: 'test-agent',
                data: { runtimeId: 'test-runtime' }
            };

            await manager.killAgent(handle);
            expect(mockRuntime.killAgent).toHaveBeenCalledWith(handle);
        });
    });

    describe('listAllAgents', () => {
        it('should list agents from all runtimes', async () => {
            const mockAgent: AgentInfo = {
                handle: {
                    runtimeType: 'mock',
                    agentId: 'test-agent',
                    data: {}
                },
                config: {
                    agentId: 'test-agent',
                    aiProvider: 'claude' as any,
                    task: 'Test',
                    workingDirectory: '/tmp',
                    sessionName: 'test'
                },
                status: AgentStatus.RUNNING,
                createdAt: Date.now(),
                lastActivityAt: Date.now()
            };

            mockRuntime.listAgents = vi.fn().mockResolvedValue([mockAgent]);
            manager.register('test-runtime', mockRuntime);

            const agents = await manager.listAllAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0].handle.agentId).toBe('test-agent');
        });

        it('should handle runtime errors gracefully', async () => {
            mockRuntime.listAgents = vi.fn().mockRejectedValue(new Error('Runtime error'));
            manager.register('test-runtime', mockRuntime);

            const agents = await manager.listAllAgents();
            expect(agents).toHaveLength(0);
        });
    });

    describe('ping', () => {
        it('should ping a specific runtime', async () => {
            manager.register('test-runtime', mockRuntime);
            await manager.ping('test-runtime');
            expect(mockRuntime.ping).toHaveBeenCalled();
        });

        it('should throw if runtime not found', async () => {
            await expect(manager.ping('non-existent'))
                .rejects.toThrow('not found');
        });
    });

    describe('pingAll', () => {
        it('should ping all runtimes', async () => {
            manager.register('runtime-1', mockRuntime);
            manager.register('runtime-2', { ...mockRuntime, ping: vi.fn().mockResolvedValue(undefined) });

            const results = await manager.pingAll();
            expect(results.size).toBe(2);
            expect(results.get('runtime-1')).toBe(true);
            expect(results.get('runtime-2')).toBe(true);
        });

        it('should handle ping failures', async () => {
            const failingRuntime = {
                ...mockRuntime,
                ping: vi.fn().mockRejectedValue(new Error('Ping failed'))
            };

            manager.register('working', mockRuntime);
            manager.register('failing', failingRuntime);

            const results = await manager.pingAll();
            expect(results.get('working')).toBe(true);
            expect(results.get('failing')).toBe(false);
        });
    });
});
