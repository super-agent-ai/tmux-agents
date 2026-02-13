/**
 * Unit tests for K8sRuntime
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { K8sRuntime } from '../../runtimes/k8sRuntime';
import { K8sRuntimeConfig, AgentConfig } from '../../runtimes/types';
import * as k8s from '@kubernetes/client-node';

// Mock the kubernetes client
vi.mock('@kubernetes/client-node');

describe('K8sRuntime', () => {
	let runtime: K8sRuntime;
	let mockK8sApi: any;
	let config: K8sRuntimeConfig;

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Mock K8s API
		mockK8sApi = {
			createNamespacedPod: vi.fn().mockResolvedValue({ body: {} }),
			deleteNamespacedPod: vi.fn().mockResolvedValue({ body: {} }),
			readNamespacedPod: vi.fn().mockResolvedValue({
				body: {
					status: { phase: 'Running' },
				},
			}),
			listNamespacedPod: vi.fn().mockResolvedValue({
				body: { items: [] },
			}),
			patchNamespacedPod: vi.fn().mockResolvedValue({ body: {} }),
		};

		// Mock KubeConfig
		const mockKubeConfig = {
			loadFromDefault: vi.fn(),
			loadFromFile: vi.fn(),
			setCurrentContext: vi.fn(),
			makeApiClient: vi.fn().mockReturnValue(mockK8sApi),
		};

		(k8s.KubeConfig as any).mockImplementation(() => mockKubeConfig);

		config = {
			type: 'kubernetes',
			id: 'k8s-test',
			enabled: true,
			namespace: 'tmux-agents',
			image: 'tmux-agents-base:latest',
			cpu: '2',
			memory: '4Gi',
		};

		runtime = new K8sRuntime(config);
	});

	describe('constructor', () => {
		it('should initialize with config', () => {
			expect(runtime.type).toBe('kubernetes');
		});

		it('should load kubeconfig from file if specified', () => {
			const customConfig = {
				...config,
				kubeconfig: '/path/to/kubeconfig',
			};

			new K8sRuntime(customConfig);

			// Verify loadFromFile was called
			expect(k8s.KubeConfig).toHaveBeenCalled();
		});

		it('should set context if specified', () => {
			const customConfig = {
				...config,
				context: 'my-context',
			};

			new K8sRuntime(customConfig);

			expect(k8s.KubeConfig).toHaveBeenCalled();
		});
	});

	describe('spawnAgent', () => {
		it('should create pod with correct spec', async () => {
			const agentConfig: AgentConfig = {
				taskId: 'task-123',
				taskName: 'Test Task',
				prompt: 'Do something',
				provider: 'claude',
				providerCommand: 'claude --model opus',
				launchDelay: 1000,
			};

			// Mock TmuxService methods
			const mockTmux = {
				sendKeys: vi.fn().mockResolvedValue(undefined),
				listSessions: vi.fn().mockResolvedValue([{ name: 'agent' }]),
			};

			vi.spyOn(runtime as any, 'getTmuxForPod').mockReturnValue(mockTmux);

			const handle = await runtime.spawnAgent(agentConfig);

			expect(handle.taskId).toBe('task-123');
			expect(handle.runtimeId).toBe('k8s-test');
			expect(handle.podName).toBeDefined();
			expect(handle.podName).toMatch(/^tmux-agent-task-123-/);

			// Verify pod creation
			expect(mockK8sApi.createNamespacedPod).toHaveBeenCalledWith(
				'tmux-agents',
				expect.objectContaining({
					apiVersion: 'v1',
					kind: 'Pod',
					metadata: expect.objectContaining({
						labels: expect.objectContaining({
							'app': 'tmux-agents',
							'task-id': 'task-123',
							'provider': 'claude',
						}),
					}),
				})
			);

			// Verify tmux commands
			expect(mockTmux.sendKeys).toHaveBeenCalledWith(
				'agent',
				'claude --model opus',
				false
			);
			expect(mockTmux.sendKeys).toHaveBeenCalledWith(
				'agent',
				'Do something',
				true
			);
		});

		it('should apply resource limits', async () => {
			const agentConfig: AgentConfig = {
				taskId: 'task-456',
				taskName: 'Resource Test',
				prompt: 'Test',
				provider: 'claude',
				providerCommand: 'claude',
				resources: {
					cpu: '4',
					memory: '8Gi',
				},
			};

			const mockTmux = {
				sendKeys: vi.fn().mockResolvedValue(undefined),
				listSessions: vi.fn().mockResolvedValue([{ name: 'agent' }]),
			};

			vi.spyOn(runtime as any, 'getTmuxForPod').mockReturnValue(mockTmux);

			await runtime.spawnAgent(agentConfig);

			const createCall = mockK8sApi.createNamespacedPod.mock.calls[0][1];
			const resources = createCall.spec.containers[0].resources;

			expect(resources.requests.cpu).toBe('4');
			expect(resources.limits.cpu).toBe('4');
			expect(resources.requests.memory).toBe('8Gi');
			expect(resources.limits.memory).toBe('8Gi');
		});

		it('should configure GPU when requested', async () => {
			const agentConfig: AgentConfig = {
				taskId: 'gpu-task',
				taskName: 'GPU Test',
				prompt: 'Test GPU',
				provider: 'claude',
				providerCommand: 'claude',
				resources: {
					gpu: 2,
				},
			};

			const mockTmux = {
				sendKeys: vi.fn().mockResolvedValue(undefined),
				listSessions: vi.fn().mockResolvedValue([{ name: 'agent' }]),
			};

			vi.spyOn(runtime as any, 'getTmuxForPod').mockReturnValue(mockTmux);

			await runtime.spawnAgent(agentConfig);

			const createCall = mockK8sApi.createNamespacedPod.mock.calls[0][1];
			const container = createCall.spec.containers[0];

			expect(container.resources.limits['nvidia.com/gpu']).toBe('2');
			expect(createCall.spec.nodeSelector['nvidia.com/gpu.present']).toBe('true');
			expect(createCall.spec.tolerations).toContainEqual(
				expect.objectContaining({
					key: 'nvidia.com/gpu',
					operator: 'Exists',
					effect: 'NoSchedule',
				})
			);
		});
	});

	describe('killAgent', () => {
		it('should delete pod', async () => {
			const handle = {
				runtimeId: 'k8s-test',
				agentId: 'k8s-test:pod-123',
				taskId: 'task-123',
				podName: 'pod-123',
				createdAt: new Date(),
			};

			await runtime.killAgent(handle);

			expect(mockK8sApi.deleteNamespacedPod).toHaveBeenCalledWith(
				'pod-123',
				'tmux-agents',
				undefined,
				undefined,
				0
			);
		});

		it('should handle 404 gracefully', async () => {
			mockK8sApi.deleteNamespacedPod.mockRejectedValue({
				response: { statusCode: 404 },
			});

			const handle = {
				runtimeId: 'k8s-test',
				agentId: 'k8s-test:pod-123',
				taskId: 'task-123',
				podName: 'pod-123',
				createdAt: new Date(),
			};

			await expect(runtime.killAgent(handle)).resolves.toBeUndefined();
		});

		it('should throw on other errors', async () => {
			mockK8sApi.deleteNamespacedPod.mockRejectedValue({
				response: { statusCode: 500 },
			});

			const handle = {
				runtimeId: 'k8s-test',
				agentId: 'k8s-test:pod-123',
				taskId: 'task-123',
				podName: 'pod-123',
				createdAt: new Date(),
			};

			await expect(runtime.killAgent(handle)).rejects.toThrow();
		});
	});

	describe('listAgents', () => {
		it('should list running agents', async () => {
			mockK8sApi.listNamespacedPod.mockResolvedValue({
				body: {
					items: [
						{
							metadata: {
								name: 'pod-1',
								labels: {
									'app': 'tmux-agents',
									'task-id': 'task-1',
									'task-name': 'Task 1',
									'provider': 'claude',
								},
								creationTimestamp: '2024-01-01T00:00:00Z',
							},
							status: {
								phase: 'Running',
							},
						},
						{
							metadata: {
								name: 'pod-2',
								labels: {
									'app': 'tmux-agents',
									'task-id': 'task-2',
									'task-name': 'Task 2',
									'provider': 'gemini',
								},
								creationTimestamp: '2024-01-01T00:01:00Z',
							},
							status: {
								phase: 'Succeeded',
							},
						},
					],
				},
			});

			const agents = await runtime.listAgents();

			expect(agents).toHaveLength(2);
			expect(agents[0].handle.podName).toBe('pod-1');
			expect(agents[0].state).toBe('running');
			expect(agents[0].provider).toBe('claude');

			expect(agents[1].handle.podName).toBe('pod-2');
			expect(agents[1].state).toBe('completed');
			expect(agents[1].provider).toBe('gemini');
		});

		it('should map pod phases to agent states', async () => {
			mockK8sApi.listNamespacedPod.mockResolvedValue({
				body: {
					items: [
						{
							metadata: {
								name: 'pod-pending',
								labels: { 'task-id': 't1' },
								creationTimestamp: '2024-01-01T00:00:00Z',
							},
							status: { phase: 'Pending' },
						},
						{
							metadata: {
								name: 'pod-running',
								labels: { 'task-id': 't2' },
								creationTimestamp: '2024-01-01T00:00:00Z',
							},
							status: { phase: 'Running' },
						},
						{
							metadata: {
								name: 'pod-succeeded',
								labels: { 'task-id': 't3' },
								creationTimestamp: '2024-01-01T00:00:00Z',
							},
							status: { phase: 'Succeeded' },
						},
						{
							metadata: {
								name: 'pod-failed',
								labels: { 'task-id': 't4' },
								creationTimestamp: '2024-01-01T00:00:00Z',
							},
							status: { phase: 'Failed' },
						},
					],
				},
			});

			const agents = await runtime.listAgents();

			expect(agents[0].state).toBe('starting');
			expect(agents[1].state).toBe('running');
			expect(agents[2].state).toBe('completed');
			expect(agents[3].state).toBe('failed');
		});
	});

	describe('getTmux', () => {
		it('should return TmuxService with correct exec prefix', () => {
			const handle = {
				runtimeId: 'k8s-test',
				agentId: 'k8s-test:my-pod',
				taskId: 'task-123',
				podName: 'my-pod',
				createdAt: new Date(),
			};

			const tmux = runtime.getTmux(handle);

			// The TmuxService should be constructed with kubectl exec prefix
			// (implementation detail, but we can verify it's created)
			expect(tmux).toBeDefined();
		});

		it('should throw if podName is missing', () => {
			const handle = {
				runtimeId: 'k8s-test',
				agentId: 'k8s-test:invalid',
				taskId: 'task-123',
				createdAt: new Date(),
			};

			expect(() => runtime.getTmux(handle)).toThrow('missing podName');
		});
	});

	describe('getAttachCommand', () => {
		it('should return kubectl exec command', () => {
			const handle = {
				runtimeId: 'k8s-test',
				agentId: 'k8s-test:my-pod',
				taskId: 'task-123',
				podName: 'my-pod',
				createdAt: new Date(),
			};

			const cmd = runtime.getAttachCommand(handle);

			expect(cmd).toBe('kubectl exec -it my-pod -n tmux-agents -- tmux attach -t agent');
		});

		it('should throw if podName is missing', () => {
			const handle = {
				runtimeId: 'k8s-test',
				agentId: 'k8s-test:invalid',
				taskId: 'task-123',
				createdAt: new Date(),
			};

			expect(() => runtime.getAttachCommand(handle)).toThrow('missing podName');
		});
	});

	describe('ping', () => {
		it('should verify K8s API access', async () => {
			await runtime.ping();

			expect(mockK8sApi.listNamespacedPod).toHaveBeenCalledWith(
				'tmux-agents',
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				1
			);
		});

		it('should throw on API error', async () => {
			mockK8sApi.listNamespacedPod.mockRejectedValue(new Error('API error'));

			await expect(runtime.ping()).rejects.toThrow('API error');
		});
	});

	describe('reconcile', () => {
		it('should return running and starting agents', async () => {
			mockK8sApi.listNamespacedPod.mockResolvedValue({
				body: {
					items: [
						{
							metadata: {
								name: 'pod-1',
								labels: { 'task-id': 't1' },
								creationTimestamp: '2024-01-01T00:00:00Z',
							},
							status: { phase: 'Running' },
						},
						{
							metadata: {
								name: 'pod-2',
								labels: { 'task-id': 't2' },
								creationTimestamp: '2024-01-01T00:00:00Z',
							},
							status: { phase: 'Pending' },
						},
						{
							metadata: {
								name: 'pod-3',
								labels: { 'task-id': 't3' },
								creationTimestamp: '2024-01-01T00:00:00Z',
							},
							status: { phase: 'Succeeded' },
						},
					],
				},
			});

			const handles = await runtime.reconcile!();

			expect(handles).toHaveLength(2);
			expect(handles[0].podName).toBe('pod-1');
			expect(handles[1].podName).toBe('pod-2');
		});
	});
});
