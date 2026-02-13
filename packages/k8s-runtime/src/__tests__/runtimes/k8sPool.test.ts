/**
 * Unit tests for K8sPool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { K8sPool, PoolConfig } from '../../runtimes/k8sPool';
import * as k8s from '@kubernetes/client-node';

vi.mock('@kubernetes/client-node');

describe('K8sPool', () => {
	let pool: K8sPool;
	let mockK8sApi: any;
	let mockAppsApi: any;
	let config: PoolConfig;

	beforeEach(() => {
		vi.clearAllMocks();

		mockK8sApi = {
			listNamespacedPod: vi.fn().mockResolvedValue({
				body: { items: [] },
			}),
			patchNamespacedPod: vi.fn().mockResolvedValue({ body: {} }),
		};

		mockAppsApi = {
			createNamespacedDeployment: vi.fn().mockResolvedValue({ body: {} }),
			replaceNamespacedDeployment: vi.fn().mockResolvedValue({ body: {} }),
			deleteNamespacedDeployment: vi.fn().mockResolvedValue({ body: {} }),
			patchNamespacedDeploymentScale: vi.fn().mockResolvedValue({ body: {} }),
		};

		const mockKubeConfig = {
			loadFromDefault: vi.fn(),
			loadFromFile: vi.fn(),
			setCurrentContext: vi.fn(),
			makeApiClient: vi.fn((api) => {
				if (api === k8s.CoreV1Api) return mockK8sApi;
				if (api === k8s.AppsV1Api) return mockAppsApi;
				return {};
			}),
		};

		(k8s.KubeConfig as any).mockImplementation(() => mockKubeConfig);
		(k8s.CoreV1Api as any) = vi.fn();
		(k8s.AppsV1Api as any) = vi.fn();

		config = {
			namespace: 'tmux-agents',
			image: 'tmux-agents-base:latest',
			minSize: 3,
			maxSize: 10,
			cpu: '2',
			memory: '4Gi',
		};

		pool = new K8sPool(config);
	});

	describe('initialize', () => {
		it('should create deployment if it does not exist', async () => {
			mockAppsApi.replaceNamespacedDeployment.mockRejectedValue({
				response: { statusCode: 404 },
			});

			await pool.initialize();

			expect(mockAppsApi.createNamespacedDeployment).toHaveBeenCalledWith(
				'tmux-agents',
				expect.objectContaining({
					apiVersion: 'apps/v1',
					kind: 'Deployment',
					metadata: expect.objectContaining({
						name: 'tmux-agents-pool',
					}),
					spec: expect.objectContaining({
						replicas: 3,
					}),
				})
			);
		});

		it('should update existing deployment', async () => {
			await pool.initialize();

			expect(mockAppsApi.replaceNamespacedDeployment).toHaveBeenCalledWith(
				'tmux-agents-pool',
				'tmux-agents',
				expect.objectContaining({
					apiVersion: 'apps/v1',
					kind: 'Deployment',
				})
			);
		});
	});

	describe('claimPod', () => {
		it('should claim an idle pod', async () => {
			mockK8sApi.listNamespacedPod.mockResolvedValue({
				body: {
					items: [
						{
							metadata: {
								name: 'pool-pod-1',
								labels: {
									'pool-claimed': 'false',
								},
								creationTimestamp: '2024-01-01T00:00:00Z',
							},
						},
					],
				},
			});

			const podName = await pool.claimPod('task-123');

			expect(podName).toBe('pool-pod-1');
			expect(mockK8sApi.patchNamespacedPod).toHaveBeenCalledWith(
				'pool-pod-1',
				'tmux-agents',
				expect.objectContaining({
					metadata: {
						labels: expect.objectContaining({
							'pool-claimed': 'true',
							'pool-claimed-by': 'task-123',
						}),
					},
				}),
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				expect.any(Object)
			);
		});

		it('should return null if no idle pods', async () => {
			mockK8sApi.listNamespacedPod.mockResolvedValue({
				body: {
					items: [
						{
							metadata: {
								name: 'pool-pod-1',
								labels: {
									'pool-claimed': 'true',
									'pool-claimed-by': 'other-task',
								},
								creationTimestamp: '2024-01-01T00:00:00Z',
							},
						},
					],
				},
			});

			const podName = await pool.claimPod('task-123');

			expect(podName).toBeNull();
			expect(mockK8sApi.patchNamespacedPod).not.toHaveBeenCalled();
		});

		it('should return null on concurrent claim', async () => {
			mockK8sApi.listNamespacedPod.mockResolvedValue({
				body: {
					items: [
						{
							metadata: {
								name: 'pool-pod-1',
								labels: {
									'pool-claimed': 'false',
								},
								creationTimestamp: '2024-01-01T00:00:00Z',
							},
						},
					],
				},
			});

			mockK8sApi.patchNamespacedPod.mockRejectedValue(
				new Error('Conflict')
			);

			const podName = await pool.claimPod('task-123');

			expect(podName).toBeNull();
		});
	});

	describe('releasePod', () => {
		it('should release pod back to pool', async () => {
			const mockTmux = {
				killSession: vi.fn().mockResolvedValue(undefined),
				newSession: vi.fn().mockResolvedValue(undefined),
			};

			vi.spyOn(pool as any, 'getTmuxForPod').mockReturnValue(mockTmux);

			await pool.releasePod('pool-pod-1');

			expect(mockK8sApi.patchNamespacedPod).toHaveBeenCalledWith(
				'pool-pod-1',
				'tmux-agents',
				expect.objectContaining({
					metadata: {
						labels: expect.objectContaining({
							'pool-claimed': 'false',
						}),
					},
				}),
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				expect.any(Object)
			);

			expect(mockTmux.killSession).toHaveBeenCalledWith('agent');
			expect(mockTmux.newSession).toHaveBeenCalledWith('agent', '/workspace', true);
		});
	});

	describe('scale', () => {
		it('should scale pool to specified size', async () => {
			await pool.scale(5);

			expect(mockAppsApi.patchNamespacedDeploymentScale).toHaveBeenCalledWith(
				'tmux-agents-pool',
				'tmux-agents',
				expect.objectContaining({
					spec: {
						replicas: 5,
					},
				}),
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				expect.any(Object)
			);
		});

		it('should clamp to minSize', async () => {
			await pool.scale(1);

			const call = mockAppsApi.patchNamespacedDeploymentScale.mock.calls[0][2];
			expect(call.spec.replicas).toBe(3); // minSize
		});

		it('should clamp to maxSize', async () => {
			await pool.scale(20);

			const call = mockAppsApi.patchNamespacedDeploymentScale.mock.calls[0][2];
			expect(call.spec.replicas).toBe(10); // maxSize
		});
	});

	describe('getPoolStats', () => {
		it('should return pool statistics', async () => {
			mockK8sApi.listNamespacedPod.mockResolvedValue({
				body: {
					items: [
						{
							metadata: {
								name: 'pod-1',
								labels: { 'pool-claimed': 'false' },
								creationTimestamp: '2024-01-01T00:00:00Z',
							},
						},
						{
							metadata: {
								name: 'pod-2',
								labels: { 'pool-claimed': 'false' },
								creationTimestamp: '2024-01-01T00:00:00Z',
							},
						},
						{
							metadata: {
								name: 'pod-3',
								labels: { 'pool-claimed': 'true', 'pool-claimed-by': 'task-1' },
								creationTimestamp: '2024-01-01T00:00:00Z',
							},
						},
					],
				},
			});

			const stats = await pool.getPoolStats();

			expect(stats).toEqual({
				total: 3,
				idle: 2,
				claimed: 1,
			});
		});
	});

	describe('destroy', () => {
		it('should delete deployment', async () => {
			await pool.destroy();

			expect(mockAppsApi.deleteNamespacedDeployment).toHaveBeenCalledWith(
				'tmux-agents-pool',
				'tmux-agents'
			);
		});

		it('should handle 404 gracefully', async () => {
			mockAppsApi.deleteNamespacedDeployment.mockRejectedValue({
				response: { statusCode: 404 },
			});

			await expect(pool.destroy()).resolves.toBeUndefined();
		});
	});
});
