/**
 * Kubernetes Warm Agent Pool (Optional)
 *
 * Pre-warms N pods with tmux ready to reduce agent spawn time.
 * Agents can claim an idle pod instead of creating a new one (instant start).
 * After task completion, pods are released back to the pool.
 *
 * Uses Deployment-based scaling for automatic pod management.
 */
import * as k8s from '@kubernetes/client-node';
import { TmuxService } from '../core/tmuxService';
export class K8sPool {
    constructor(config) {
        this.config = config;
        this.namespace = config.namespace;
        this.deploymentName = 'tmux-agents-pool';
        // Load kubeconfig
        this.kc = new k8s.KubeConfig();
        if (config.kubeconfig) {
            this.kc.loadFromFile(config.kubeconfig);
        }
        else {
            this.kc.loadFromDefault();
        }
        // Set context if specified
        if (config.context) {
            this.kc.setCurrentContext(config.context);
        }
        this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
        this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
    }
    // ─── Pool Management ────────────────────────────────────────────────────
    /**
     * Initialize the warm pool by creating/updating the Deployment.
     */
    async initialize() {
        const deploymentSpec = this.buildDeploymentSpec();
        try {
            // Try to update existing deployment
            await this.appsApi.replaceNamespacedDeployment({
                name: this.deploymentName,
                namespace: this.namespace,
                body: deploymentSpec,
            });
        }
        catch (err) {
            if (err.response?.statusCode === 404) {
                // Deployment doesn't exist, create it
                await this.appsApi.createNamespacedDeployment({
                    namespace: this.namespace,
                    body: deploymentSpec,
                });
            }
            else {
                throw err;
            }
        }
    }
    /**
     * Claim an idle pod from the pool for a task.
     */
    async claimPod(taskId) {
        const pods = await this.listPoolPods();
        const idlePod = pods.find(p => !p.claimed);
        if (!idlePod) {
            return null; // No idle pods available
        }
        // Label the pod as claimed
        try {
            await this.k8sApi.patchNamespacedPod({
                name: idlePod.name,
                namespace: this.namespace,
                body: {
                    metadata: {
                        labels: {
                            'pool-claimed': 'true',
                            'pool-claimed-by': taskId,
                            'pool-claimed-at': new Date().toISOString(),
                        },
                    },
                },
            });
            return idlePod.name;
        }
        catch (err) {
            // Another process may have claimed it concurrently
            return null;
        }
    }
    /**
     * Release a pod back to the pool after task completion.
     */
    async releasePod(podName) {
        // Remove claim labels
        await this.k8sApi.patchNamespacedPod({
            name: podName,
            namespace: this.namespace,
            body: {
                metadata: {
                    labels: {
                        'pool-claimed': 'false',
                        'pool-claimed-by': null,
                        'pool-claimed-at': null,
                    },
                },
            },
        });
        // Reset tmux session (kill any running processes)
        const tmux = this.getTmuxForPod(podName);
        try {
            await tmux.deleteSession('agent');
            await tmux.newSession('agent', { cwd: '/workspace' });
        }
        catch {
            // Session may not exist, create it
            await tmux.newSession('agent', { cwd: '/workspace' });
        }
    }
    /**
     * Scale the pool to a specific size.
     */
    async scale(replicas) {
        const clampedReplicas = Math.max(this.config.minSize, Math.min(this.config.maxSize, replicas));
        await this.appsApi.patchNamespacedDeploymentScale({
            name: this.deploymentName,
            namespace: this.namespace,
            body: {
                spec: {
                    replicas: clampedReplicas,
                },
            },
        });
    }
    /**
     * Get the current pool size and utilization.
     */
    async getPoolStats() {
        const pods = await this.listPoolPods();
        const claimed = pods.filter(p => p.claimed).length;
        return {
            total: pods.length,
            idle: pods.length - claimed,
            claimed,
        };
    }
    /**
     * Destroy the pool (delete the Deployment).
     */
    async destroy() {
        try {
            await this.appsApi.deleteNamespacedDeployment({
                name: this.deploymentName,
                namespace: this.namespace,
            });
        }
        catch (err) {
            if (err.response?.statusCode !== 404) {
                throw err;
            }
        }
    }
    // ─── Private Helpers ────────────────────────────────────────────────────
    async listPoolPods() {
        const labelSelector = 'app=tmux-agents,pool=true';
        const response = await this.k8sApi.listNamespacedPod({
            namespace: this.namespace,
            labelSelector,
        });
        return response.items.map(pod => {
            const labels = pod.metadata.labels || {};
            const claimed = labels['pool-claimed'] === 'true';
            return {
                name: pod.metadata.name,
                claimed,
                claimedBy: labels['pool-claimed-by'],
                claimedAt: labels['pool-claimed-at']
                    ? new Date(labels['pool-claimed-at'])
                    : undefined,
                createdAt: pod.metadata.creationTimestamp
                    ? new Date(pod.metadata.creationTimestamp)
                    : new Date(),
            };
        });
    }
    getTmuxForPod(podName) {
        const execPrefix = `kubectl exec ${podName} -n ${this.namespace} --`;
        const serverIdentity = {
            id: `k8s-pool-${podName}`,
            label: `K8s Pool Pod: ${podName}`,
            isLocal: false,
        };
        return new TmuxService(serverIdentity, execPrefix);
    }
    buildDeploymentSpec() {
        const labels = {
            'app': 'tmux-agents',
            'pool': 'true',
        };
        const container = {
            name: 'agent',
            image: this.config.image,
            imagePullPolicy: 'IfNotPresent',
            command: ['sh', '-c', 'tmux new-session -d -s agent && sleep infinity'],
            workingDir: '/workspace',
            resources: {
                requests: {
                    cpu: this.config.cpu || '1',
                    memory: this.config.memory || '2Gi',
                },
                limits: {
                    cpu: this.config.cpu || '1',
                    memory: this.config.memory || '2Gi',
                },
            },
        };
        // Add GPU if requested
        if (this.config.gpu) {
            const gpuCount = typeof this.config.gpu === 'number' ? this.config.gpu : 1;
            container.resources.limits['nvidia.com/gpu'] = gpuCount.toString();
        }
        const deployment = {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
                name: this.deploymentName,
                namespace: this.namespace,
                labels,
            },
            spec: {
                replicas: this.config.minSize,
                selector: {
                    matchLabels: labels,
                },
                template: {
                    metadata: {
                        labels: {
                            ...labels,
                            'pool-claimed': 'false',
                        },
                    },
                    spec: {
                        containers: [container],
                        restartPolicy: 'Always',
                    },
                },
            },
        };
        return deployment;
    }
}
//# sourceMappingURL=k8sPool.js.map