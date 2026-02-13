/**
 * Unit tests for K8sWatcher
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { K8sWatcher, AgentEvent } from '../../runtimes/k8sWatcher';
import * as k8s from '@kubernetes/client-node';

vi.mock('@kubernetes/client-node');

describe('K8sWatcher', () => {
	let watcher: K8sWatcher;
	let mockWatch: any;
	let mockKubeConfig: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockWatch = {
			watch: vi.fn(),
		};

		mockKubeConfig = {
			loadFromDefault: vi.fn(),
		};

		(k8s.KubeConfig as any).mockImplementation(() => mockKubeConfig);
		(k8s.Watch as any).mockImplementation(() => mockWatch);

		watcher = new K8sWatcher(mockKubeConfig as any, 'tmux-agents');
	});

	afterEach(() => {
		watcher.stop();
	});

	describe('start', () => {
		it('should start watching pods', async () => {
			mockWatch.watch.mockImplementation(async (path: string, queryParams: any, onEvent: any, onDone: any) => {
				// Simulate watch started
				return Promise.resolve();
			});

			await watcher.start();

			expect(mockWatch.watch).toHaveBeenCalledWith(
				'/api/v1/namespaces/tmux-agents/pods',
				expect.objectContaining({
					labelSelector: 'app=tmux-agents',
					watch: 'true',
				}),
				expect.any(Function),
				expect.any(Function),
				expect.any(Object) // AbortSignal
			);
		});
	});

	describe('stop', () => {
		it('should abort watch and clear timers', async () => {
			const abortController = new AbortController();
			vi.spyOn(globalThis, 'AbortController').mockReturnValue(abortController as any);
			vi.spyOn(abortController, 'abort');

			mockWatch.watch.mockImplementation(async () => Promise.resolve());

			await watcher.start();
			watcher.stop();

			expect(abortController.abort).toHaveBeenCalled();
		});
	});

	describe('event handling', () => {
		let onEventCallback: any;

		beforeEach(async () => {
			mockWatch.watch.mockImplementation(async (path: string, queryParams: any, onEvent: any) => {
				onEventCallback = onEvent;
				return Promise.resolve();
			});

			await watcher.start();
		});

		it('should emit agent.created on ADDED event', (done) => {
			watcher.on('agent.created', (event: AgentEvent) => {
				expect(event.eventType).toBe('created');
				expect(event.podName).toBe('test-pod');
				expect(event.taskId).toBe('task-123');
				done();
			});

			onEventCallback('ADDED', {
				metadata: {
					name: 'test-pod',
					labels: {
						'task-id': 'task-123',
						'task-name': 'Test Task',
						'provider': 'claude',
					},
				},
				status: {
					phase: 'Pending',
				},
			});
		});

		it('should emit agent.running on Running phase', (done) => {
			watcher.on('agent.running', (event: AgentEvent) => {
				expect(event.eventType).toBe('running');
				expect(event.podName).toBe('test-pod');
				expect(event.phase).toBe('Running');
				done();
			});

			onEventCallback('MODIFIED', {
				metadata: {
					name: 'test-pod',
					labels: {
						'task-id': 'task-123',
					},
				},
				status: {
					phase: 'Running',
				},
			});
		});

		it('should emit agent.completed on Succeeded phase', (done) => {
			watcher.on('agent.completed', (event: AgentEvent) => {
				expect(event.eventType).toBe('completed');
				expect(event.phase).toBe('Succeeded');
				done();
			});

			onEventCallback('MODIFIED', {
				metadata: {
					name: 'test-pod',
					labels: {
						'task-id': 'task-123',
					},
				},
				status: {
					phase: 'Succeeded',
				},
			});
		});

		it('should emit agent.failed on Failed phase', (done) => {
			watcher.on('agent.failed', (event: AgentEvent) => {
				expect(event.eventType).toBe('failed');
				expect(event.phase).toBe('Failed');
				done();
			});

			onEventCallback('MODIFIED', {
				metadata: {
					name: 'test-pod',
					labels: {
						'task-id': 'task-123',
					},
				},
				status: {
					phase: 'Failed',
				},
			});
		});

		it('should emit agent.deleted on DELETED event', (done) => {
			watcher.on('agent.deleted', (event: AgentEvent) => {
				expect(event.eventType).toBe('deleted');
				done();
			});

			onEventCallback('DELETED', {
				metadata: {
					name: 'test-pod',
					labels: {
						'task-id': 'task-123',
					},
				},
				status: {
					phase: 'Running',
				},
			});
		});

		it('should include labels in event', (done) => {
			watcher.on('agent', (event: AgentEvent) => {
				expect(event.labels).toEqual({
					'task-id': 'task-123',
					'task-name': 'My Task',
					'provider': 'gemini',
					'custom': 'value',
				});
				done();
			});

			onEventCallback('ADDED', {
				metadata: {
					name: 'test-pod',
					labels: {
						'task-id': 'task-123',
						'task-name': 'My Task',
						'provider': 'gemini',
						'custom': 'value',
					},
				},
				status: {
					phase: 'Pending',
				},
			});
		});
	});

	describe('reconnection', () => {
		it('should reconnect on watch error', async () => {
			let onDoneCallback: any;

			mockWatch.watch.mockImplementation(async (path: string, queryParams: any, onEvent: any, onDone: any) => {
				onDoneCallback = onDone;
				return Promise.resolve();
			});

			await watcher.start();

			// First call
			expect(mockWatch.watch).toHaveBeenCalledTimes(1);

			// Simulate watch ending
			onDoneCallback(new Error('Watch timeout'));

			// Wait for reconnect timer (5s + some buffer)
			await new Promise(resolve => setTimeout(resolve, 5100));

			// Should have reconnected
			expect(mockWatch.watch).toHaveBeenCalledTimes(2);
		});

		it('should not reconnect if stopped', async () => {
			let onDoneCallback: any;

			mockWatch.watch.mockImplementation(async (path: string, queryParams: any, onEvent: any, onDone: any) => {
				onDoneCallback = onDone;
				return Promise.resolve();
			});

			await watcher.start();
			watcher.stop();

			// Simulate watch ending after stop
			onDoneCallback(new Error('Watch timeout'));

			// Wait for reconnect timer
			await new Promise(resolve => setTimeout(resolve, 5100));

			// Should NOT have reconnected
			expect(mockWatch.watch).toHaveBeenCalledTimes(1);
		});
	});
});
