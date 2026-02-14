/**
 * Kubernetes Runtime Implementation
 *
 * Creates pods with tmux pre-installed and uses TmuxService with "kubectl exec" prefix
 * for all tmux operations. Supports GPU scheduling, resource limits, and warm agent pools.
 */
import * as k8s from '@kubernetes/client-node';
import { TmuxService } from '../core/tmuxService.js';
export class K8sRuntime {
    constructor(config) {
        this.type = 'kubernetes';
        this.config = config;
        this.namespace = config.namespace;
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
    }
    // ─── Agent Lifecycle ────────────────────────────────────────────────────
    async spawnAgent(config) {
        const podName = this.generatePodName(config.taskId);
        const agentId = `${this.config.id}:${podName}`;
        // 1. Create pod spec
        const podSpec = this.buildPodSpec(podName, config);
        // 2. Create pod
        await this.k8sApi.createNamespacedPod(this.namespace, podSpec);
        // 3. Wait for pod to be running
        await this.waitForPodRunning(podName);
        // 4. Wait for tmux to be ready
        const tmux = this.getTmuxForPod(podName);
        await this.waitForTmuxReady(tmux);
        // 5. Launch AI CLI
        await tmux.sendKeysToSession('agent', config.providerCommand);
        // 6. Wait for AI CLI to be ready
        if (config.launchDelay) {
            await new Promise(resolve => setTimeout(resolve, config.launchDelay));
        }
        else {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Default 2s
        }
        // 7. Send task prompt
        await tmux.sendKeysToSession('agent', config.prompt);
        return {
            runtimeId: this.config.id,
            agentId,
            taskId: config.taskId,
            podName,
            createdAt: new Date(),
        };
    }
    async killAgent(handle) {
        if (!handle.podName) {
            throw new Error('Invalid handle: missing podName');
        }
        try {
            await this.k8sApi.deleteNamespacedPod(handle.podName, this.namespace);
        }
        catch (err) {
            if (err.response?.statusCode === 404) {
                // Pod already deleted
                return;
            }
            throw err;
        }
    }
    async listAgents() {
        const labelSelector = 'app=tmux-agents';
        const response = await this.k8sApi.listNamespacedPod(this.namespace, undefined, undefined, undefined, undefined, labelSelector);
        return response.body.items.map((pod) => {
            const podName = pod.metadata.name;
            const labels = pod.metadata.labels || {};
            const phase = pod.status.phase;
            let state = 'running';
            if (phase === 'Pending') {
                state = 'starting';
            }
            else if (phase === 'Succeeded') {
                state = 'completed';
            }
            else if (phase === 'Failed') {
                state = 'failed';
            }
            else if (phase === 'Unknown') {
                state = 'failed';
            }
            return {
                handle: {
                    runtimeId: this.config.id,
                    agentId: `${this.config.id}:${podName}`,
                    taskId: labels['task-id'] || '',
                    podName,
                    createdAt: pod.metadata.creationTimestamp
                        ? new Date(pod.metadata.creationTimestamp)
                        : new Date(),
                },
                state,
                taskName: labels['task-name'] || '',
                provider: labels['provider'] || '',
                createdAt: pod.metadata.creationTimestamp
                    ? new Date(pod.metadata.creationTimestamp)
                    : new Date(),
                labels,
            };
        });
    }
    getTmux(handle) {
        if (!handle.podName) {
            throw new Error('Invalid handle: missing podName');
        }
        return this.getTmuxForPod(handle.podName);
    }
    getAttachCommand(handle) {
        if (!handle.podName) {
            throw new Error('Invalid handle: missing podName');
        }
        return `kubectl exec -it ${handle.podName} -n ${this.namespace} -- tmux attach -t agent`;
    }
    async ping() {
        // Try to list pods in the namespace to verify API access
        await this.k8sApi.listNamespacedPod(this.namespace);
    }
    async reconcile() {
        const agents = await this.listAgents();
        return agents
            .filter(agent => agent.state === 'running' || agent.state === 'starting')
            .map(agent => agent.handle);
    }
    // ─── Private Helpers ────────────────────────────────────────────────────
    generatePodName(taskId) {
        // K8s names must be lowercase alphanumeric + dash, max 253 chars
        const sanitized = taskId
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .substring(0, 50);
        const timestamp = Date.now().toString(36);
        return `tmux-agent-${sanitized}-${timestamp}`;
    }
    getTmuxForPod(podName) {
        const execPrefix = `kubectl exec ${podName} -n ${this.namespace} --`;
        const serverIdentity = {
            id: `k8s-${podName}`,
            label: `K8s Pod: ${podName}`,
            isLocal: false,
        };
        return new TmuxService(serverIdentity, execPrefix);
    }
    buildPodSpec(podName, config) {
        const labels = {
            'app': 'tmux-agents',
            'runtime-id': this.config.id,
            'task-id': config.taskId,
            'task-name': this.sanitizeLabel(config.taskName),
            'provider': config.provider,
            ...config.labels,
        };
        // Build container spec
        const container = {
            name: 'agent',
            image: this.config.image,
            imagePullPolicy: 'IfNotPresent',
            command: ['sh', '-c', 'tmux new-session -d -s agent && sleep infinity'],
            workingDir: config.workingDirectory || '/workspace',
            env: this.buildEnvVars(config.env),
            resources: this.buildResourceRequirements(config.resources),
        };
        // Build pod spec
        const pod = {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
                name: podName,
                namespace: this.namespace,
                labels,
            },
            spec: {
                containers: [container],
                restartPolicy: 'Never',
                nodeSelector: this.buildNodeSelector(config.resources),
                tolerations: this.buildTolerations(config.resources),
            },
        };
        return pod;
    }
    sanitizeLabel(value) {
        // K8s labels must be alphanumeric + dash/underscore/dot, max 63 chars
        return value
            .replace(/[^a-zA-Z0-9-_.]/g, '-')
            .substring(0, 63);
    }
    buildEnvVars(env) {
        const envVars = [];
        if (env) {
            for (const [key, value] of Object.entries(env)) {
                envVars.push({ name: key, value });
            }
        }
        return envVars;
    }
    buildResourceRequirements(resources) {
        const requirements = {
            requests: {},
            limits: {},
        };
        // CPU
        const cpu = resources?.cpu || this.config.cpu || '1';
        requirements.requests.cpu = cpu;
        requirements.limits.cpu = cpu;
        // Memory
        const memory = resources?.memory || this.config.memory || '2Gi';
        requirements.requests.memory = memory;
        requirements.limits.memory = memory;
        // GPU
        const gpu = resources?.gpu ?? this.config.gpu;
        if (gpu) {
            const gpuCount = typeof gpu === 'number' ? gpu : 1;
            requirements.limits['nvidia.com/gpu'] = gpuCount.toString();
        }
        return requirements;
    }
    buildNodeSelector(resources) {
        const nodeSelector = {
            ...this.config.nodeSelector,
        };
        // Add GPU node selector if GPU requested
        const gpu = resources?.gpu ?? this.config.gpu;
        if (gpu) {
            nodeSelector['nvidia.com/gpu.present'] = 'true';
        }
        return Object.keys(nodeSelector).length > 0 ? nodeSelector : undefined;
    }
    buildTolerations(resources) {
        const tolerations = [
            ...(this.config.tolerations || []),
        ];
        // Add GPU toleration if GPU requested
        const gpu = resources?.gpu ?? this.config.gpu;
        if (gpu) {
            tolerations.push({
                key: 'nvidia.com/gpu',
                operator: 'Exists',
                effect: 'NoSchedule',
            });
        }
        return tolerations.length > 0 ? tolerations : undefined;
    }
    async waitForPodRunning(podName, timeoutMs = 60000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            try {
                const response = await this.k8sApi.readNamespacedPod(podName, this.namespace);
                const phase = response.body.status?.phase;
                if (phase === 'Running') {
                    return;
                }
                else if (phase === 'Failed' || phase === 'Unknown') {
                    throw new Error(`Pod ${podName} entered ${phase} phase`);
                }
                // Wait 500ms before checking again
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            catch (err) {
                if (err.response?.statusCode === 404) {
                    // Pod not found yet, keep waiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                else {
                    throw err;
                }
            }
        }
        throw new Error(`Timeout waiting for pod ${podName} to be running`);
    }
    async waitForTmuxReady(tmux, timeoutMs = 30000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            try {
                const hasSession = await tmux.hasSession('agent');
                if (hasSession) {
                    return;
                }
            }
            catch {
                // tmux not ready yet
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        throw new Error('Timeout waiting for tmux session to be ready');
    }
}
//# sourceMappingURL=k8sRuntime.js.map