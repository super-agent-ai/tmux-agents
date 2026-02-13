/**
 * Kubernetes Pod Event Watcher
 *
 * Watches pod lifecycle events via the K8s Watch API and emits events for:
 * - agent.created (pod created)
 * - agent.running (pod entered Running phase)
 * - agent.completed (pod succeeded)
 * - agent.failed (pod failed)
 * - agent.deleted (pod deleted)
 *
 * Handles automatic reconnection when the watch times out.
 */

import * as k8s from '@kubernetes/client-node';
import { EventEmitter } from 'events';

export interface PodEvent {
	type: 'ADDED' | 'MODIFIED' | 'DELETED';
	pod: k8s.V1Pod;
}

export interface AgentEvent {
	eventType: 'created' | 'running' | 'completed' | 'failed' | 'deleted';
	podName: string;
	taskId: string;
	taskName: string;
	provider: string;
	phase: string;
	labels: Record<string, string>;
}

export class K8sWatcher extends EventEmitter {
	private kc: k8s.KubeConfig;
	private watch: k8s.Watch;
	private namespace: string;
	private labelSelector: string;
	private abortController: AbortController | null = null;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private stopped = false;

	constructor(kubeconfig: k8s.KubeConfig, namespace: string, labelSelector: string = 'app=tmux-agents') {
		super();
		this.kc = kubeconfig;
		this.watch = new k8s.Watch(this.kc);
		this.namespace = namespace;
		this.labelSelector = labelSelector;
	}

	/**
	 * Start watching pod events.
	 */
	async start(): Promise<void> {
		this.stopped = false;
		await this.startWatch();
	}

	/**
	 * Stop watching and clean up resources.
	 */
	stop(): void {
		this.stopped = true;

		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	// ─── Private Methods ────────────────────────────────────────────────────

	private async startWatch(): Promise<void> {
		if (this.stopped) {
			return;
		}

		this.abortController = new AbortController();

		const path = `/api/v1/namespaces/${this.namespace}/pods`;
		const queryParams = {
			labelSelector: this.labelSelector,
			watch: 'true',
		};

		try {
			await this.watch.watch(
				path,
				queryParams,
				(type: string, apiObj: any, watchObj: any) => {
					this.handlePodEvent({
						type: type as PodEvent['type'],
						pod: apiObj as k8s.V1Pod,
					});
				},
				(err: any) => {
					if (err) {
						this.emit('error', err);
					}
					// Watch ended (timeout or error), reconnect
					this.scheduleReconnect();
				}
			);
		} catch (err) {
			this.emit('error', err);
			this.scheduleReconnect();
		}
	}

	private scheduleReconnect(): void {
		if (this.stopped) {
			return;
		}

		// Reconnect after 5 seconds
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.startWatch();
		}, 5000);
	}

	private handlePodEvent(event: PodEvent): void {
		const pod = event.pod;
		const podName = pod.metadata?.name;
		const labels = pod.metadata?.labels || {};
		const phase = pod.status?.phase || 'Unknown';

		if (!podName) {
			return;
		}

		const taskId = labels['task-id'] || '';
		const taskName = labels['task-name'] || '';
		const provider = labels['provider'] || '';

		let agentEventType: AgentEvent['eventType'] | null = null;

		if (event.type === 'ADDED') {
			agentEventType = 'created';
		} else if (event.type === 'DELETED') {
			agentEventType = 'deleted';
		} else if (event.type === 'MODIFIED') {
			// Emit events based on phase transitions
			if (phase === 'Running') {
				agentEventType = 'running';
			} else if (phase === 'Succeeded') {
				agentEventType = 'completed';
			} else if (phase === 'Failed') {
				agentEventType = 'failed';
			}
		}

		if (agentEventType) {
			const agentEvent: AgentEvent = {
				eventType: agentEventType,
				podName,
				taskId,
				taskName,
				provider,
				phase,
				labels,
			};

			this.emit('agent', agentEvent);
			this.emit(`agent.${agentEventType}`, agentEvent);
		}
	}
}
