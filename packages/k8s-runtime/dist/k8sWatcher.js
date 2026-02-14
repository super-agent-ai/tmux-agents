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
export class K8sWatcher extends EventEmitter {
    constructor(kubeconfig, namespace, labelSelector = 'app=tmux-agents') {
        super();
        this.abortController = null;
        this.reconnectTimer = null;
        this.stopped = false;
        this.kc = kubeconfig;
        this.watch = new k8s.Watch(this.kc);
        this.namespace = namespace;
        this.labelSelector = labelSelector;
    }
    /**
     * Start watching pod events.
     */
    async start() {
        this.stopped = false;
        await this.startWatch();
    }
    /**
     * Stop watching and clean up resources.
     */
    stop() {
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
    async startWatch() {
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
            await this.watch.watch(path, queryParams, (type, apiObj, watchObj) => {
                this.handlePodEvent({
                    type: type,
                    pod: apiObj,
                });
            }, (err) => {
                if (err) {
                    this.emit('error', err);
                }
                // Watch ended (timeout or error), reconnect
                this.scheduleReconnect();
            });
        }
        catch (err) {
            this.emit('error', err);
            this.scheduleReconnect();
        }
    }
    scheduleReconnect() {
        if (this.stopped) {
            return;
        }
        // Reconnect after 5 seconds
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.startWatch();
        }, 5000);
    }
    handlePodEvent(event) {
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
        let agentEventType = null;
        if (event.type === 'ADDED') {
            agentEventType = 'created';
        }
        else if (event.type === 'DELETED') {
            agentEventType = 'deleted';
        }
        else if (event.type === 'MODIFIED') {
            // Emit events based on phase transitions
            if (phase === 'Running') {
                agentEventType = 'running';
            }
            else if (phase === 'Succeeded') {
                agentEventType = 'completed';
            }
            else if (phase === 'Failed') {
                agentEventType = 'failed';
            }
        }
        if (agentEventType) {
            const agentEvent = {
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
//# sourceMappingURL=k8sWatcher.js.map