"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Reconciler = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// ─── Reconciler ──────────────────────────────────────────────────────────────
class Reconciler {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
    }
    // Main reconciliation entry point
    async reconcile(db, orchestrator) {
        this.logger.info('reconciler', 'Starting agent reconciliation');
        const result = {
            totalAgents: 0,
            reconnected: 0,
            lost: 0,
            errors: 0,
            details: []
        };
        try {
            // Load all active agents from database
            const agents = await this.loadActiveAgents(db);
            result.totalAgents = agents.length;
            this.logger.info('reconciler', `Found ${agents.length} active agents to reconcile`);
            // Check each agent
            for (const agent of agents) {
                try {
                    const runtime = this.getRuntimeById(agent.runtimeId || 'local');
                    if (!runtime) {
                        result.details.push({
                            agentId: agent.id,
                            status: 'lost',
                            message: `Runtime ${agent.runtimeId} not configured`
                        });
                        result.lost++;
                        await this.markAgentLost(db, agent.id);
                        continue;
                    }
                    const isAlive = await this.checkAgentAlive(agent, runtime);
                    if (isAlive) {
                        // Reconnect agent (restore in orchestrator)
                        await this.reconnectAgent(db, orchestrator, agent);
                        result.details.push({
                            agentId: agent.id,
                            status: 'reconnected',
                            message: 'Agent is alive and reconnected'
                        });
                        result.reconnected++;
                        this.logger.info('reconciler', `Reconnected agent ${agent.id}`);
                    }
                    else {
                        // Mark as lost
                        await this.markAgentLost(db, agent.id);
                        result.details.push({
                            agentId: agent.id,
                            status: 'lost',
                            message: 'Agent runtime no longer exists'
                        });
                        result.lost++;
                        this.logger.warn('reconciler', `Agent ${agent.id} is lost`);
                    }
                }
                catch (err) {
                    result.details.push({
                        agentId: agent.id,
                        status: 'error',
                        message: `Reconciliation error: ${err}`
                    });
                    result.errors++;
                    this.logger.error('reconciler', `Error reconciling agent ${agent.id}`, { error: err });
                }
            }
            this.logger.info('reconciler', 'Reconciliation complete', {
                total: result.totalAgents,
                reconnected: result.reconnected,
                lost: result.lost,
                errors: result.errors
            });
        }
        catch (err) {
            this.logger.error('reconciler', 'Reconciliation failed', { error: err });
            throw err;
        }
        return result;
    }
    // Load active agents from database
    async loadActiveAgents(db) {
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM agent_instances WHERE state NOT IN ('terminated', 'completed')`, [], (err, rows) => {
                if (err)
                    reject(err);
                else
                    resolve(rows || []);
            });
        });
    }
    // Get runtime config by ID
    getRuntimeById(id) {
        return this.config.runtimes.find(r => r.id === id);
    }
    // Check if agent's runtime target still exists
    async checkAgentAlive(agent, runtime) {
        try {
            switch (runtime.type) {
                case 'local-tmux':
                    return await this.checkTmuxSession(agent.sessionName || agent.tmuxSessionName);
                case 'docker':
                    return await this.checkDockerContainer(agent.containerId);
                case 'k8s':
                    return await this.checkKubernetesPod(agent.podName, agent.namespace);
                case 'ssh':
                    return await this.checkSshTmuxSession(runtime, agent.sessionName || agent.tmuxSessionName);
                default:
                    this.logger.warn('reconciler', `Unknown runtime type: ${runtime.type}`);
                    return false;
            }
        }
        catch (err) {
            this.logger.error('reconciler', `Failed to check agent ${agent.id}`, { error: err });
            return false;
        }
    }
    // Check if tmux session exists locally
    async checkTmuxSession(sessionName) {
        try {
            await execAsync(`tmux has-session -t ${sessionName} 2>/dev/null`);
            return true;
        }
        catch {
            return false;
        }
    }
    // Check if Docker container exists
    async checkDockerContainer(containerId) {
        if (!containerId)
            return false;
        try {
            const { stdout } = await execAsync(`docker inspect ${containerId} --format='{{.State.Running}}'`);
            return stdout.trim() === 'true';
        }
        catch {
            return false;
        }
    }
    // Check if Kubernetes pod exists
    async checkKubernetesPod(podName, namespace = 'default') {
        if (!podName)
            return false;
        try {
            await execAsync(`kubectl get pod ${podName} -n ${namespace} -o name`);
            return true;
        }
        catch {
            return false;
        }
    }
    // Check if tmux session exists on remote SSH host
    async checkSshTmuxSession(runtime, sessionName) {
        if (!sessionName)
            return false;
        try {
            const host = runtime.host || 'unknown';
            await execAsync(`ssh ${host} "tmux has-session -t ${sessionName}" 2>/dev/null`);
            return true;
        }
        catch {
            return false;
        }
    }
    // Reconnect agent (restore in orchestrator)
    async reconnectAgent(db, orchestrator, agent) {
        // Note: This is a placeholder. In a full implementation, we'd need to:
        // 1. Re-establish TmuxService connection
        // 2. Re-register agent with orchestrator
        // 3. Restore any in-progress task assignments
        // For now, just update the database to mark it as reconnected
        return new Promise((resolve, reject) => {
            db.run(`UPDATE agent_instances SET state = 'idle', errorMessage = NULL WHERE id = ?`, [agent.id], (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    // Mark agent as lost in database
    async markAgentLost(db, agentId) {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE agent_instances SET state = 'error', errorMessage = 'Lost during reconciliation (runtime no longer exists)' WHERE id = ?`, [agentId], (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
}
exports.Reconciler = Reconciler;
//# sourceMappingURL=reconciler.js.map